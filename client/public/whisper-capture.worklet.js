/* Whisper streaming capture worklet (slice 55).
 *
 * Runs inside an AudioContext created with { sampleRate: 16000 } so its
 * output is already 16 kHz mono — exactly what the /transcribe-chunk
 * endpoint expects. Per 128-sample block it:
 *   1. applies a high-pass biquad (~85 Hz, RBJ cookbook) to kill rumble,
 *      wind and mains hum before anything else sees the signal;
 *   2. posts an RMS level ~12x/second for the mic level meter;
 *   3. accumulates filtered samples and emits overlapping PCM windows:
 *      4 s of audio every 3 s (1 s overlap), as transferable Int16Array
 *      buffers, so transcription pipelines while the user speaks.
 *   4. on "flush", emits the remaining tail as a final chunk.
 *
 * Browser-native echoCancellation/noiseSuppression/autoGainControl are
 * applied upstream via getUserMedia constraints; this worklet deliberately
 * does NOT run a second denoiser (RNNoise etc.) — that would burn CPU for
 * marginal gain on top of what the browser already does.
 */
class WhisperCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = 16000;
    this.windowSize = 4 * this.sampleRate; // 4 s window
    this.stride = 3 * this.sampleRate; // 3 s stride -> 1 s overlap
    this.buffer = new Float32Array(this.windowSize + 4096);
    this.bufLen = 0;
    this.seq = 0;
    this.stopped = false;
    this.flushed = false;

    // High-pass biquad @ ~85 Hz, Q = 0.7071 (RBJ cookbook).
    const f0 = 85;
    const Q = 0.7071;
    const w0 = (2 * Math.PI * f0) / this.sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);
    const cw0 = Math.cos(w0);
    const b0 = (1 + cw0) / 2;
    const b1 = -(1 + cw0);
    const b2 = (1 + cw0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cw0;
    const a2 = 1 - alpha;
    this.hpB = [b0 / a0, b1 / a0, b2 / a0];
    this.hpA = [a1 / a0, a2 / a0];
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;

    this.blockCounter = 0;

    this.port.onmessage = (e) => {
      if (e.data === "flush") this.flush();
      if (e.data === "stop") this.stopped = true;
    };
  }

  emitChunk(pcm, isFinal) {
    this.port.postMessage(
      { type: "chunk", seq: this.seq++, pcm: pcm.buffer, final: !!isFinal },
      [pcm.buffer],
    );
  }

  flush() {
    if (this.flushed) return;
    this.flushed = true;
    // Emit the tail (anything over ~0.3 s is worth transcribing).
    if (this.bufLen > 0.3 * this.sampleRate) {
      const pcm = new Int16Array(this.bufLen);
      for (let i = 0; i < this.bufLen; i++) {
        const s = Math.max(-1, Math.min(1, this.buffer[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.emitChunk(pcm, true);
    }
    this.port.postMessage({ type: "done" });
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || this.stopped) return !this.stopped;
    const ch = input[0];

    let sum = 0;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      const y =
        this.hpB[0] * x +
        this.hpB[1] * this.x1 +
        this.hpB[2] * this.x2 -
        this.hpA[0] * this.y1 -
        this.hpA[1] * this.y2;
      this.x2 = this.x1;
      this.x1 = x;
      this.y2 = this.y1;
      this.y1 = y;
      if (this.bufLen < this.buffer.length) {
        this.buffer[this.bufLen++] = y;
      }
      sum += y * y;
    }

    if (++this.blockCounter % 10 === 0) {
      this.port.postMessage({ type: "level", rms: Math.sqrt(sum / ch.length) });
    }

    while (this.bufLen >= this.windowSize) {
      const pcm = new Int16Array(this.windowSize);
      for (let i = 0; i < this.windowSize; i++) {
        const s = Math.max(-1, Math.min(1, this.buffer[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.emitChunk(pcm, false);
      // Slide forward by the stride, keeping the 1 s overlap.
      this.buffer.copyWithin(0, this.stride, this.bufLen);
      this.bufLen -= this.stride;
    }
    return true;
  }
}

registerProcessor("whisper-capture", WhisperCaptureProcessor);
