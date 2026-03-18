import os
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
from werkzeug.utils import secure_filename
from database import get_db_connection, init_db
from auth import hash_password, check_password, generate_token, token_required
import string
import random
import boto3
from dotenv import load_dotenv
from botocore.config import Config
import threading
import time
import psycopg2

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Error handlers — always return JSON so JS never gets HTML to parse
@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum allowed size exceeded.'}), 413

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error. Please try again.'}), 500

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'txt', 'mp4', 'mp3', 'zip', 'rar'}
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500 MB max globally (vault limited in routes)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Initialize S3 Client (Backblaze B2)
s3_client = boto3.client(
    's3',
    endpoint_url=os.environ.get('B2_ENDPOINT_URL'),
    aws_access_key_id=os.environ.get('B2_KEY_ID'),
    aws_secret_access_key=os.environ.get('B2_APPLICATION_KEY'),
    config=Config(signature_version='s3v4')
)

# Ensure local upload directory exists (only for temp usage if any)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize DB
init_db()

# ==========================================
# BACKGROUND CLEANUP THREAD
# Runs every 60 seconds, independent of requests
# ==========================================
def _background_cleanup():
    while True:
        try:
            time.sleep(60)
            conn = get_db_connection()
            cursor = conn.cursor()

            cursor.execute(
                "SELECT id, filename FROM files WHERE uploaded_at < NOW() - INTERVAL '48 hours'"
            )
            old_files = cursor.fetchall()
            for f in old_files:
                try:
                    s3_client.delete_object(Bucket=os.environ.get('B2_BUCKET_NAME'), Key=f['filename'])
                except: pass
                cursor.execute("DELETE FROM files WHERE id = %s", (f['id'],))

            cursor.execute(
                "SELECT id, filename FROM quick_shares WHERE uploaded_at < NOW() - INTERVAL '5 minutes'"
            )
            old_qs = cursor.fetchall()
            for q in old_qs:
                try:
                    s3_client.delete_object(Bucket=os.environ.get('B2_BUCKET_NAME'), Key=q['filename'])
                except: pass
                cursor.execute("DELETE FROM quick_shares WHERE id = %s", (q['id'],))

            conn.commit()
            conn.close()
        except Exception as e:
            print("[Cleanup Thread Error]:", e)

# Start the cleanup thread as a daemon (auto-stops when Flask stops)
_cleanup_thread = threading.Thread(target=_background_cleanup, daemon=True)
_cleanup_thread.start()

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==========================================
# STATIC FILE ROUTES
# ==========================================
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/dashboard')
def serve_dashboard():
    return send_from_directory(app.static_folder, 'dashboard.html')

# ==========================================
# VAULT & AUTHENTICATION API
# ==========================================
@app.route('/api/create_vault', methods=['POST'])
def create_vault():
    if request.content_length and request.content_length > 100 * 1024 * 1024:
        return jsonify({'error': 'Vault files are limited to a total of 100MB per upload. Use Quick Share for larger files up to 500MB.'}), 413
        
    username = request.form.get('username')
    password = request.form.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Vault Name (username) and password are required'}), 400
        
    hashed = hash_password(password)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Create the vault (user)
        cursor.execute("INSERT INTO users (username, password) VALUES (%s, %s) RETURNING id", (username, hashed))
        user_id = cursor.fetchone()['id']
        
        # Handle initial files if provided in the same request
        files_uploaded = 0
        if 'files' in request.files:
            files = request.files.getlist('files')
            for file in files:
                if file and file.filename != '' and allowed_file(file.filename):
                    original_filename = file.filename
                    filename = secure_filename(file.filename)
                    unique_filename = f"{user_id}_{os.urandom(8).hex()}_{filename}"
                    
                    s3_client.upload_fileobj(
                        file.stream,
                        os.environ.get('B2_BUCKET_NAME'),
                        unique_filename
                    )
                    
                    file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'unknown'
                    
                    cursor.execute(
                        "INSERT INTO files (user_id, filename, original_filename, file_type) VALUES (%s, %s, %s, %s)",
                        (user_id, unique_filename, original_filename, file_extension)
                    )
                    files_uploaded += 1
        
        conn.commit()
        
        # Generate token so they can log in immediately if frontend wants
        token = generate_token(user_id, username)
        
        return jsonify({
            'message': f'Vault "{username}" created successfully with {files_uploaded} files.',
            'token': token,
            'user': {'id': user_id, 'username': username}
        }), 201
        
    except psycopg2.IntegrityError:
        conn.rollback()
        return jsonify({'error': 'Vault Name already exists. Please choose a different name or use Access to view it.'}), 409
    finally:
        conn.close()

@app.route('/api/access_vault', methods=['POST'])
def access_vault():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user and check_password(password, user['password']):
        token = generate_token(user['id'], user['username'])
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {'id': user['id'], 'username': user['username']}
        }), 200
    
    return jsonify({'error': 'Invalid credentials'}), 401

# ==========================================
# FILE MANAGEMENT API
# ==========================================
@app.route('/api/upload', methods=['POST'])
@token_required
def upload_file(current_user):
    if request.content_length and request.content_length > 100 * 1024 * 1024:
        return jsonify({'error': 'Vault files are limited to a total of 100MB per upload. Use Quick Share for larger files up to 500MB.'}), 413
        
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and allowed_file(file.filename):
        original_filename = file.filename
        filename = secure_filename(file.filename)
        
        # Make filename unique to avoid collisions
        unique_filename = f"{current_user['id']}_{os.urandom(8).hex()}_{filename}"
        
        s3_client.upload_fileobj(
            file.stream,
            os.environ.get('B2_BUCKET_NAME'),
            unique_filename
        )
        
        file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'unknown'
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO files (user_id, filename, original_filename, file_type) VALUES (%s, %s, %s, %s)",
            (current_user['id'], unique_filename, original_filename, file_extension)
        )
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'File successfully uploaded'}), 201
        
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/api/files', methods=['GET'])
@token_required
def get_files(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, original_filename, file_type, comment, uploaded_at FROM files WHERE user_id = %s ORDER BY uploaded_at DESC", 
        (current_user['id'],)
    )
    files = cursor.fetchall()
    conn.close()
    
    # Convert datetime objects to ISO strings for JSON serialization
    file_list = []
    for row in files:
        f = dict(row)
        if f.get('uploaded_at'):
            f['uploaded_at'] = f['uploaded_at'].isoformat()
        file_list.append(f)
    
    return jsonify({'files': file_list}), 200

@app.route('/api/files/download/<int:file_id>', methods=['GET'])
@token_required
def download_file(current_user, file_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM files WHERE id = %s AND user_id = %s", 
        (file_id, current_user['id'])
    )
    file_record = cursor.fetchone()
    conn.close()
    
    if not file_record:
        return jsonify({'error': 'File not found or access denied'}), 404
        
    try:
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': os.environ.get('B2_BUCKET_NAME'),
                'Key': file_record['filename'],
                'ResponseContentDisposition': f'attachment; filename="{file_record["original_filename"]}"'
            },
            ExpiresIn=3600
        )
        return redirect(presigned_url)
    except Exception as e:
        return jsonify({'error': 'Failed to fetch file from cloud'}), 500

@app.route('/api/files/comment/<int:file_id>', methods=['POST'])
@token_required
def add_comment(current_user, file_id):
    data = request.json
    comment = data.get('comment', '')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE files SET comment = %s WHERE id = %s AND user_id = %s",
        (comment, file_id, current_user['id'])
    )
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Comment updated successfully'}), 200

@app.route('/api/files/view/<int:file_id>', methods=['GET'])
@token_required
def view_file_route(current_user, file_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM files WHERE id = %s AND user_id = %s", 
        (file_id, current_user['id'])
    )
    file_record = cursor.fetchone()
    conn.close()
    
    if not file_record:
        return jsonify({'error': 'File not found or access denied'}), 404
        
    try:
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': os.environ.get('B2_BUCKET_NAME'),
                'Key': file_record['filename'],
                'ResponseContentDisposition': f'inline; filename="{file_record["original_filename"]}"'
            },
            ExpiresIn=3600
        )
        return jsonify({'url': presigned_url}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch file from cloud'}), 500

# ==========================================
# QUICK SHARE API (Send-Anywhere style)
# ==========================================
@app.route('/api/quick_share/send', methods=['POST'])
def quick_share_send():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and allowed_file(file.filename):
        original_filename = file.filename
        filename = secure_filename(file.filename)
        
        # Generate 6-digit key
        conn = get_db_connection()
        cursor = conn.cursor()
        
        while True:
            share_key = ''.join(random.choices(string.digits, k=6))
            cursor.execute("SELECT 1 FROM quick_shares WHERE share_key = %s", (share_key,))
            if not cursor.fetchone():
                break
                
        unique_filename = f"qs_{share_key}_{filename}"
        
        s3_client.upload_fileobj(
            file.stream,
            os.environ.get('B2_BUCKET_NAME'),
            unique_filename
        )
        
        file_extension = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'unknown'
        
        cursor.execute(
            "INSERT INTO quick_shares (share_key, filename, original_filename, file_type) VALUES (%s, %s, %s, %s)",
            (share_key, unique_filename, original_filename, file_extension)
        )
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'File ready to share',
            'share_key': share_key,
            'original_filename': original_filename
        }), 201
        
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/api/quick_share/receive/<share_key>', methods=['GET'])
def quick_share_receive(share_key):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM quick_shares WHERE share_key = %s AND uploaded_at >= NOW() - INTERVAL '5 minutes'", 
        (share_key,)
    )
    record = cursor.fetchone()
    conn.close()
    
    if not record:
        return jsonify({'error': 'Invalid 6-digit key or file expired'}), 404
        
    return jsonify({
        'share_key': record['share_key'],
        'original_filename': record['original_filename'],
        'file_type': record['file_type']
    }), 200

@app.route('/api/quick_share/download/<share_key>', methods=['GET'])
def quick_share_download(share_key):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM quick_shares WHERE share_key = %s AND uploaded_at >= NOW() - INTERVAL '5 minutes'", 
        (share_key,)
    )
    record = cursor.fetchone()
    
    if not record:
        conn.close()
        return jsonify({'error': 'File not found, expired, or already downloaded by someone else.'}), 404
        
    # Mark it as USED so no one else can ever download it again (Single-use security)
    cursor.execute("UPDATE quick_shares SET share_key = %s WHERE id = %s", (f"USED_{record['id']}", record['id']))
    conn.commit()
    conn.close()
        
    try:
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': os.environ.get('B2_BUCKET_NAME'),
                'Key': record['filename'],
                'ResponseContentDisposition': f'attachment; filename="{record["original_filename"]}"'
            },
            ExpiresIn=3600
        )
        return redirect(presigned_url)
    except Exception as e:
        return jsonify({'error': 'Failed to fetch file from cloud'}), 500

# ==========================================
# PROMOTIONS API
# ==========================================
@app.route('/api/promotion', methods=['GET'])
def get_promotion():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM promotions ORDER BY id DESC LIMIT 1")
    promo = cursor.fetchone()
    conn.close()
    
    if promo:
        return jsonify({'image_url': promo['image_url'], 'link_url': promo['link_url']}), 200
    return jsonify({'image_url': '', 'link_url': ''}), 200

@app.route('/api/promotion', methods=['POST'])
@token_required # In a real app, verify admin role here
def update_promotion(current_user):
    data = request.json
    image_url = data.get('image_url')
    link_url = data.get('link_url')
    
    if not image_url or not link_url:
        return jsonify({'error': 'image_url and link_url required'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE promotions SET image_url = %s, link_url = %s WHERE id = (SELECT id FROM promotions LIMIT 1)", (image_url, link_url))
    if cursor.rowcount == 0:
         cursor.execute("INSERT INTO promotions (image_url, link_url) VALUES (%s, %s)", (image_url, link_url))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Promotion updated successfully'}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)
