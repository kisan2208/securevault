import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    
    # Files Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_type TEXT,
            comment TEXT,
            uploaded_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Quick Shares Table (Send-Anywhere style)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS quick_shares (
            id SERIAL PRIMARY KEY,
            share_key TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_type TEXT,
            uploaded_at TIMESTAMP DEFAULT NOW()
        )
    ''')
    
    # Promotions Table (Only one row expected for simplicity)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS promotions (
            id SERIAL PRIMARY KEY,
            image_url TEXT NOT NULL,
            link_url TEXT NOT NULL
        )
    ''')
    
    # Insert a default promotion if empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM promotions")
    if cursor.fetchone()['cnt'] == 0:
        cursor.execute('''
            INSERT INTO promotions (image_url, link_url) 
            VALUES ('https://via.placeholder.com/600x150?text=Your+Ad+Here', 'https://example.com')
        ''')

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
