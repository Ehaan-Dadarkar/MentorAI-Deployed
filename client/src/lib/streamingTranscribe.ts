// Streaming transcription helpers (slice 55).
//
// The client sends overlapping audio windows (5 s of audio every 4 s, so a
// 1 s overlap) and each comes back transcribed independently. This module
// stitches those chunk transcripts into one continuous transcript by
// removing the duplicated overlap, and builds the short context prompt
// fed back to Whisper for cross-chunk continuity.

const stripEdgePunct = (w: string): string =>
  w.replace(/^[.,!?;:'"()[\]{}]+|[.,!?;:'"()[\]{}]+$/g, "");

const normWord = (w: string): string => stripEdgePunct(w).toLowerCase();

/**
 * Merge a newly transcribed chunk into the accumulated transcript.
 * Finds the longest word-level suffix of `accumulated` that matches a
 * prefix of `chunk` (the re-transcribed overlap window) and appends only
 * the non-overlapping remainder. Comparison is case- and
 * punctuation-insensitive; the accumulated text keeps its original form.
 * Falls back to plain concatenation when no overlap of at least
 * `minOverlapWords` is found.
 */
export function mergeChunkTranscript(
  accumulated: string,
  chunk: string,
  minOverlapWords = 2,
): string {
  const acc = accumulated.trim();
  const txt = chunk.trim();
  if (!acc) return txt;
  if (!txt) return acc;

  const accWords = acc.split(/\s+/);
  const txtWords = txt.split(/\s+/);

  // The whole chunk already appears verbatim inside the accumulated text
  // (a fully repeated overlap window) — nothing new to add.
  const accJoined = ` ${accWords.map(normWord).join(" ")} `;
  if (accJoined.includes(` ${txtWords.map(normWord).join(" ")} `)) {
    return acc;
  }

  const maxN = Math.min(accWords.length, txtWords.length);

  for (let n = maxN; n >= minOverlapWords; n--) {
    let matches = true;
    for (let i = 0; i < n; i++) {
      if (normWord(accWords[accWords.length - n + i]) !== normWord(txtWords[i])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return [...accWords, ...txtWords.slice(n)].join(" ");
    }
  }
  return `${acc} ${txt}`;
}

/**
 * Tail of the accumulated transcript used as Whisper's `initial_prompt`
 * for the next chunk, so the model keeps linguistic context across the
 * chunk boundary.
 */
export function promptTail(text: string, maxWords = 12): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(-maxWords).join(" ");
}
