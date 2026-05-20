@echo off
title Mentorai Whisper — First Time Setup
color 0A

echo.
echo  Mentorai Whisper Server Setup
echo  ─────────────────────────────
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    echo Download from https://python.org
    pause
    exit /b 1
)

echo [1/5] Python found
python --version

:: Create virtual environment
echo.
echo [2/5] Creating virtual environment...
python -m venv venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create venv
    pause
    exit /b 1
)
echo Virtual environment created.

:: Activate venv
echo.
echo [3/5] Activating virtual environment...
call venv\Scripts\activate

:: Install CPU-only PyTorch first
echo.
echo [4/5] Installing PyTorch ^(CPU version^)...
echo This may take a few minutes...
pip install torch==2.3.0 torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/cpu
if %errorlevel% neq 0 (
    echo [ERROR] PyTorch installation failed
    pause
    exit /b 1
)

:: Install remaining requirements
echo.
echo [5/5] Installing remaining dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Requirements installation failed
    pause
    exit /b 1
)

echo.
echo  ─────────────────────────────────────────
echo  Setup complete!
echo.
echo  Whisper model will download on first start.
echo  Model size: ~150MB ^(whisper-tiny^)
echo.
echo  To start the server:
echo    Double-click start_whisper.bat
echo  OR run:
echo    venv\Scripts\activate
echo    uvicorn main:app --host 0.0.0.0 --port 5001
echo  ─────────────────────────────────────────
echo.
pause
