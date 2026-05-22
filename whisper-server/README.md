# Whisper Transcription Service

Location: `whisper-server/`

Overview
- Lightweight FastAPI service that accepts audio, converts it with `ffmpeg`, and runs OpenAI Whisper (or local model) for transcription.

Setup

```bash
cd whisper-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
 
Run

```bash
python3 main.py
# or with uvicorn
uvicorn main:app --host 0.0.0.0 --port 5100
```

Notes
- Ensure `ffmpeg` is installed on the host.
- The service is intentionally lightweight and used by the main server for voice recall sessions.
