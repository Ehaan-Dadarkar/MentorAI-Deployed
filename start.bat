@echo off
title Mentorai - Start All Services
color 0A

echo.
echo  MENTORAI - AI-Powered Learning OS
echo  ====================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    pause
    exit /b 1
)

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    pause
    exit /b 1
)

where ollama >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Ollama not found. Install from ollama.com
    echo [WARNING] Continuing without Ollama startup...
    echo.
) else (
    echo [1/4] Starting Ollama on port 11434...
    start /min "Mentorai - Ollama" cmd /k "ollama serve"
    timeout /t 3 /nobreak >nul
    echo Checking Ollama model...
    ollama list | find "qwen3.5:2b" >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] qwen3.5:2b not found.
        echo Run: ollama pull qwen3.5:2b
    ) else (
        echo Pre-warming qwen3.5:2b into RAM...
        ollama run qwen3.5:2b --think=false "hello" >nul 2>&1
        echo Model ready.
    )
)

if not exist "%~dp0whisper-server\venv\Scripts\activate.bat" (
    echo [WARNING] Whisper venv not found. Skipping...
    echo.
    goto :start_node
)

echo [2/4] Starting Whisper Server on port 5001...
start /min "Mentorai - Whisper" cmd /k "cd /d %~dp0whisper-server && call venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 5001"
timeout /t 3 /nobreak >nul

:start_node
echo [3/4] Starting Node Backend on port 5000...
start /min "Mentorai - Backend" cmd /k "cd /d %~dp0server && npm run dev"
timeout /t 2 /nobreak >nul

echo [4/4] Starting React Frontend on port 5173...
start /min "Mentorai - Frontend" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo  ====================================
echo  Ollama   - http://localhost:11434
echo  Whisper  - http://localhost:5001/health
echo  Backend  - http://localhost:5000
echo  Frontend - http://localhost:5173
echo  ====================================
echo.
start http://localhost:5173

echo  App is running. Press any key to STOP all servers...
pause >nul

taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im ollama.exe >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon ^| find ":5001" ^| find "LISTENING" 2^>nul') do taskkill /pid %%a /f >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING" 2^>nul') do taskkill /pid %%a /f >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING" 2^>nul') do taskkill /pid %%a /f >nul 2>&1

taskkill /f /fi "windowtitle eq Mentorai*" >nul 2>&1

exit