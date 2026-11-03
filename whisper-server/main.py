from fastapi import FastAPI, File, UploadFile, Form, Request
from fastapi.middleware.cors import CORSMiddleware
import whisper
import numpy as np
import wave
import tempfile
import os
import shutil
import subprocess

# H4: portable ffmpeg resolution. FFMPEG_DIR wins when set (any OS);
# otherwise ffmpeg must already be on PATH. (The old hardcoded
# C:\ffmpeg\bin broke every non-Windows host.)
_ffmpeg_dir = os.environ.get("FFMPEG_DIR")
if _ffmpeg_dir:
    os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
if shutil.which("ffmpeg") is None:
    print("WARNING: ffmpeg not found on PATH (set FFMPEG_DIR) - transcription will fail")

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
# H4: Render free tier has 512 MB RAM; whisper "small" needs ~1 GB and
# OOMs there. Default to "tiny"; set WHISPER_MODEL=small (or larger) on
# hosts with the RAM for it.
MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny")
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

@app.post("/transcribe-chunk")
async def transcribe_chunk(request: Request, seq: int = 0, prompt: str = ""):
    """Streaming chunk endpoint (slice 55): the client POSTs raw 16 kHz mono
    int16 PCM while the user is still speaking; each chunk is transcribed
    immediately so the transcript builds live instead of waiting for the
    whole recording. `prompt` carries the previous chunk's tail as whisper
    initial-prompt context for continuity across chunk boundaries."""
    wav_path = None
    try:
        data = await request.body()
        if not data or len(data) > 400_000:
            return {"success": False, "transcript": "", "seq": seq,
                    "error": "empty or oversized chunk"}
        pcm = np.frombuffer(data, dtype=np.int16)
        if pcm.size < 1600:  # < 0.1 s of audio — nothing to transcribe
            return {"success": True, "transcript": "", "seq": seq}
        # Write a WAV header around the PCM so whisper's loader takes the
        # same code path as the whole-file endpoint (no new API surface).
        with tempfile.NamedTemporaryFile(delete=False, suffix=".chunk.wav") as tmp:
            wav_path = tmp.name
        with wave.open(wav_path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(data)
        clean_prompt = (prompt or "").strip() or None
        result = MODEL.transcribe(
            wav_path,
            language="en",
            fp16=False,
            temperature=0.2,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            initial_prompt=clean_prompt,
        )
        return {"success": True, "transcript": result["text"].strip(), "seq": seq}
    except Exception as e:
        print(f"Chunk transcription error: {e}")
        return {"success": False, "transcript": "", "seq": seq, "error": str(e)}
    finally:
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)


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
