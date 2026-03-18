@echo off
echo Starting SecureVault Admin & File Upload Backend...
echo ====================================================

:: Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in your PATH. 
    echo Please install Python 3.x to run this application.
    pause
    exit /b
)

:: Ensure we're in the right directory
cd /d %~dp0

:: Check if virtual environment exists
if not exist "venv" (
    echo [1/3] Creating Python Virtual Environment...
    python -m venv venv
    
    echo [2/3] Activating and installing dependencies...
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    echo [1/3] Environment already set up.
    call venv\Scripts\activate
)

echo [3/3] Launching Backend Server and opening Browser...
echo ====================================================
echo You can stop the server anytime by closing this window or pressing Ctrl+C

:: Load the application in a background thread to allow Flask to start up first
start /b cmd /c "ping 127.0.0.1 -n 4 > nul & start http://127.0.0.1:5000"

:: Run the Flask App using the virtual environment's Python (required for boto3)
venv\Scripts\python app.py
pause
