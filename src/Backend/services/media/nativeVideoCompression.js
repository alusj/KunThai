import { Capacitor, registerPlugin } from "@capacitor/core";
import { readMp4Layout } from "./mp4Layout.js";

// Before a video is uploaded (Explore Swip/UrFeed, UrMall), the KunThai app
// compresses it on the phone: only the chosen trim window, H.264/AAC MP4, up to
// 1080p, ~5 Mbps, index at the front (faststart). That looks the same as the
// camera original on a phone screen but is a fraction of the size (a 15 s,
// 40 MB clip becomes ~9 MB), so it starts at once and streams without stalls.
// Native code: ios/App/App/VideoCompressionPlugin.swift and
// android/app/src/main/java/app/kunthai/mobile/KunThaiVideoPlugin.java.
//
// Never blocks an upload: in a browser, an older app build, or on any failure
// the original file is uploaded exactly as before.
//
// A file that is not already faststart (fragmented MediaRecorder output,
// index at the end) is always re-encoded, even when it is light enough to
// skip: those files take seconds to start in Swip on Android.

const KunThaiVideo = registerPlugin("KunThaiVideo");

export const UPLOAD_MAX_SHORT_SIDE = 1080;
export const UPLOAD_VIDEO_BITRATE = 5_000_000;
const CHUNK_BYTES = 3 * 1024 * 1024;

export function canCompressVideosNatively() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("KunThaiVideo");
  } catch {
    return false;
  }
}

function readChunkAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Video could not be read."));
    reader.readAsDataURL(blob);
  });
}

function mp4Name(name = "") {
  const base = String(name || "video").replace(/\.[a-z0-9]+$/i, "") || "video";
  return `${base}.mp4`;
}

/**
 * Whether the phone must re-encode `file` even when it is light enough to
 * upload as-is: anything not known to be a faststart MP4/MOV.
 */
export async function needsFaststartRewrite(file) {
  try {
    return (await readMp4Layout(file)).layout !== "faststart";
  } catch {
    return true;
  }
}

/**
 * Whether the compressed output should be uploaded instead of the original.
 * A forced rewrite is kept even when slightly bigger: it starts at once.
 */
export function shouldUseCompressedOutput({ outputBytes, originalBytes, trimmed, forced, maxBytes = Infinity }) {
  if (!outputBytes) return false;
  if (outputBytes > maxBytes) return false;
  if (trimmed || forced) return true;
  return outputBytes < originalBytes;
}

/**
 * Compresses `file` for upload. Resolves
 * { file, compressed, trimmed, durationSeconds } — `file` is the original when
 * nothing was done. `trimmed`: the file now holds only trimStart..trimEnd, so
 * that window must no longer be applied when playing it.
 */
export async function compressVideoForUpload(file, { trimStart = 0, trimEnd = null, onProgress, maxBytes = Infinity } = {}) {
  if (!file || !canCompressVideosNatively()) return { file, compressed: false, trimmed: false };
  const force = await needsFaststartRewrite(file);

  let listener = null;
  let outputPath = "";
  try {
    // Android: the video the file picker returned is read where it is (no
    // copy). Otherwise it is copied into the app: the first 20% of progress.
    let id = "";
    try {
      // Native method "usePicked" (not a React hook; named lookup keeps the
      // hooks lint rule from mistaking it for one).
      id = (await KunThaiVideo["usePicked"]({ name: file.name || "", size: file.size }))?.id || "";
    } catch {
      id = "";
    }
    if (!id) {
      ({ id } = await KunThaiVideo.beginFile({ name: file.name || "video.mp4" }));
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const data = await readChunkAsBase64(file.slice(offset, offset + CHUNK_BYTES));
        await KunThaiVideo.appendFile({ id, data });
        onProgress?.(Math.min(0.2, ((offset + CHUNK_BYTES) / Math.max(file.size, 1)) * 0.2));
      }
    }
    onProgress?.(0.2);

    listener = await KunThaiVideo.addListener("progress", (event) => {
      if (event?.id === id) onProgress?.(0.2 + 0.8 * Math.max(0, Math.min(1, Number(event.progress) || 0)));
    });

    const start = Math.max(0, Number(trimStart) || 0);
    const end = Number(trimEnd);
    const result = await KunThaiVideo.compress({
      id,
      startSeconds: start,
      ...(Number.isFinite(end) && end > start ? { endSeconds: end } : {}),
      maxShortSide: UPLOAD_MAX_SHORT_SIDE,
      videoBitrate: UPLOAD_VIDEO_BITRATE,
      force,
    });

    if (result?.skipped || !result?.path) {
      onProgress?.(1);
      return { file, compressed: false, trimmed: false };
    }

    outputPath = result.path;
    const response = await fetch(Capacitor.convertFileSrc(outputPath));
    if (!response.ok) throw new Error("Compressed video could not be read.");
    const blob = await response.blob();
    // Never upload something bigger than what was picked, unless it had to
    // be rewritten to start at once.
    if (!shouldUseCompressedOutput({
      outputBytes: blob.size,
      originalBytes: file.size,
      trimmed: Boolean(result.trimmed),
      forced: force,
      maxBytes,
    })) {
      return { file, compressed: false, trimmed: false };
    }
    onProgress?.(1);
    return {
      file: new File([blob], mp4Name(file.name), { type: "video/mp4", lastModified: Date.now() }),
      compressed: true,
      trimmed: Boolean(result.trimmed),
      durationSeconds: Number(result.durationSeconds) || null,
    };
  } catch {
    return { file, compressed: false, trimmed: false };
  } finally {
    listener?.remove?.();
    if (outputPath) KunThaiVideo.deleteFile({ path: outputPath }).catch(() => {});
  }
}

/**
 * Same, shaped for the upload services: the file to upload and the trim window
 * still to apply when playing it (null when the file is already just the clip).
 */
export async function prepareVideoForUpload(file, { trimStart = null, trimEnd = null, onProgress, maxBytes } = {}) {
  const hasWindow = trimEnd != null && Number.isFinite(Number(trimEnd));
  const result = await compressVideoForUpload(file, {
    trimStart: hasWindow ? Number(trimStart) || 0 : 0,
    trimEnd: hasWindow ? Number(trimEnd) : null,
    onProgress,
    maxBytes,
  });
  if (result.compressed && result.trimmed) {
    return { file: result.file, trimStart: null, trimEnd: null, compressed: true, durationSeconds: result.durationSeconds };
  }
  return { file: result.file, trimStart, trimEnd, compressed: result.compressed, durationSeconds: result.durationSeconds };
}
