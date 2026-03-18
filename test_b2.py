import os
import boto3
from dotenv import load_dotenv

load_dotenv()

s3_client = boto3.client(
    's3',
    endpoint_url=os.environ.get('B2_ENDPOINT_URL'),
    aws_access_key_id=os.environ.get('B2_KEY_ID'),
    aws_secret_access_key=os.environ.get('B2_APPLICATION_KEY')
)

try:
    with open('requirements.txt', 'rb') as f:
        s3_client.upload_fileobj(f, os.environ.get('B2_BUCKET_NAME'), 'test-upload.txt')
    print("UPLOAD SUCCESSFUL!")
except Exception as e:
    print("ERROR:")
    print(e)
