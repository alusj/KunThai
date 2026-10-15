// Pure helpers for voice notes (no React, no browser globals; unit-tested).

// Recording formats in order of preference. MP4/AAC plays on every phone
// (iPhone included); WebM/Opus is what most Android and desktop browsers
// record when they cannot make MP4, and iPhones often cannot play it.
export const VOICE_MIME_PREFERENCE = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

/** The best recording format this browser supports, or "" to let it choose. */
export function pickVoiceMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== "function") return "";
  for (const type of VOICE_MIME_PREFERENCE) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // Some engines throw for unknown types; try the next one.
    }
  }
  return "";
}

/** 0:07, 1:05, 12:30. Unknown or broken durations read as 0:00. */
export function formatVoiceTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A stable waveform shape for a voice note: the same note always draws the
 * same bars, and different notes look different. Heights are 0.25–1.
 */
export function voiceWaveform(seed = "", count = 28) {
  let hash = 2166136261;
  const text = String(seed || "voice");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const bars = [];
  for (let index = 0; index < count; index += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const random = ((hash >>> 0) % 1000) / 1000;
    // A gentle envelope so the middle of a note looks fuller than its ends.
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (index + 0.5)) / count);
    bars.push(Math.round(Math.max(0.25, Math.min(1, (0.35 + random * 0.65) * envelope)) * 100) / 100);
  }
  return bars;
}

/** The bare MIME of a data: URL or a file name's extension ("" when unknown). */
export function voiceSourceType(url = "") {
  const value = String(url || "");
  if (value.startsWith("data:")) return value.slice(5, value.indexOf(";") > 0 ? value.indexOf(";") : value.indexOf(",")).toLowerCase();
  const path = value.split("?")[0].toLowerCase();
  if (path.endsWith(".webm")) return "audio/webm";
  if (path.endsWith(".ogg") || path.endsWith(".oga")) return "audio/ogg";
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "audio/mp4";
  if (path.endsWith(".aac")) return "audio/aac";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  if (path.endsWith(".wav")) return "audio/wav";
  return "";
}
