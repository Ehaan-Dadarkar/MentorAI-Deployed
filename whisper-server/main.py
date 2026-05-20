from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import whisper
import tempfile
import os
import shutil
import subprocess

os.environ["PATH"] = r"C:\ffmpeg\bin" + os.pathsep + os.environ.get("PATH", "")

app = FastAPI(title="Mentorai Whisper Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = "cpu"
MODEL_NAME = "small"
print(f"Loading whisper-{MODEL_NAME} on CPU...")
MODEL = whisper.load_model(MODEL_NAME, device=DEVICE)
print(f"Whisper ready on CPU")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": f"whisper-{MODEL_NAME}",
        "device": "cpu",
        "cuda_available": False
    }

@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    subject: str = Form(default=""),
    topic: str = Form(default=""),
):
    # Save original audio
    with tempfile.NamedTemporaryFile(
        delete=False, suffix=".webm"
    ) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        webm_path = tmp.name

    # Convert path for WAV output
    wav_path = webm_path.replace(".webm", ".wav")

    try:
        # Convert webm → wav using ffmpeg
        # This ensures Whisper gets clean audio
        result = subprocess.run([
            "ffmpeg",
            "-y",                    # overwrite
            "-i", webm_path,         # input
            "-ar", "16000",          # 16kHz sample rate
            "-ac", "1",              # mono
            "-c:a", "pcm_s16le",     # PCM WAV format
            wav_path                 # output
        ], capture_output=True, text=True)

        if result.returncode != 0:
            print("ffmpeg error:", result.stderr)
            raise Exception("Audio conversion failed")

        print(f"Converted to WAV: {wav_path}")

        # Transcribe the WAV file
        transcription = MODEL.transcribe(
            wav_path,
            language="en",
            fp16=False,
            temperature=0.2,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
        )

        transcript = transcription["text"].strip()

        # Filter out empty/noise results
        clean = transcript.strip(".,!? ")
        if len(clean) < 3:
            transcript = ""

        print(f"Transcribed: '{transcript}'")

        return {
            "success": True,
            "transcript": transcript,
            "device": "cpu",
        }

    except Exception as e:
        print(f"Transcription error: {e}")
        return {
            "success": False,
            "transcript": "",
            "error": str(e),
        }

    finally:
        # Clean up both temp files
        if os.path.exists(webm_path):
            os.remove(webm_path)
        if os.path.exists(wav_path):
            os.remove(wav_path)
