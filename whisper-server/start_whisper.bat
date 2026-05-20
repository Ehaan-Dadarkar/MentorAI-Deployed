@echo off
title Mentorai — Whisper Server
color 0A

echo.
echo  Mentorai Whisper Server
echo  ─────────────────────────
echo.

if not exist "venv\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found.
    echo Run setup.bat first.
    pause
    exit /b 1
)

echo Activating virtual environment...
call venv\Scripts\activate

echo.
echo Starting Whisper server on port 5001...
echo First transcription may take 3-5 seconds on CPU.
echo.
echo Health check: http://localhost:5001/health
echo.

uvicorn main:app --host 0.0.0.0 --port 5001 --reload

pause
