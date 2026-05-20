#!/bin/bash

echo ""
echo "MENTORAI - AI-Powered Learning OS"
echo "===================================="
echo ""

# -------------------------------
# Check dependencies
# -------------------------------
command -v node >/dev/null 2>&1 || { echo "[ERROR] Node.js not found"; exit 1; }
command -v python >/dev/null 2>&1 || { echo "[ERROR] Python not found"; exit 1; }

# -------------------------------
# 1. Ollama
# -------------------------------
if ! command -v ollama >/dev/null 2>&1; then
    echo "[WARNING] Ollama not found. Skipping..."
else
    if pgrep -x "ollama" > /dev/null; then
        echo "[1/4] Ollama already running ✔"
    else
        echo "[1/4] Starting Ollama..."
        ollama serve &
        sleep 3
    fi

    echo "Checking model..."
    if ! ollama list | grep -q "qwen3.5:2b"; then
        echo "[WARNING] Model not found. Run: ollama pull qwen3.5:2b"
    else
        echo "Preloading model..."
        ollama run qwen3.5:2b "hello" >/dev/null 2>&1 &
        echo "Model ready ✔"
    fi
fi

# -------------------------------
# 2. Whisper Server (optional)
# -------------------------------
if [ -f "./whisper-server/venv/bin/activate" ]; then
    echo "[2/4] Starting Whisper..."
    cd whisper-server
    source venv/bin/activate
    uvicorn main:app --host 0.0.0.0 --port 5001 &
    cd ..
    sleep 3
else
    echo "[WARNING] Whisper venv not found. Skipping..."
fi

# -------------------------------
# 3. Backend
# -------------------------------
if [ -d "./server" ]; then
    echo "[3/4] Starting Backend..."
    cd server
    npm run dev &
    cd ..
    sleep 2
else
    echo "[ERROR] 'server' folder not found!"
fi

# -------------------------------
# 4. Frontend (auto-detect)
# -------------------------------
if [ -d "./client" ]; then
    echo "[4/4] Starting Frontend (client)..."
    cd client
    npm run dev &
    cd ..
elif [ -d "./frontend" ]; then
    echo "[4/4] Starting Frontend (frontend)..."
    cd frontend
    npm run dev &
    cd ..
else
    echo "[WARNING] No frontend folder found (client/frontend). Skipping..."
fi

sleep 2

# -------------------------------
# Info
# -------------------------------
echo ""
echo "===================================="
echo "Frontend: http://localhost:5173"
echo "Backend : http://localhost:5000"
echo "Whisper : http://localhost:5001"
echo "Ollama  : http://localhost:11434"
echo "===================================="

# Open browser (optional)
xdg-open http://localhost:5173 >/dev/null 2>&1 &

echo ""
echo "Press Ctrl+C to stop all services..."

# -------------------------------
# Graceful shutdown
# -------------------------------
trap "echo 'Stopping services...'; kill 0" SIGINT SIGTERM

wait
