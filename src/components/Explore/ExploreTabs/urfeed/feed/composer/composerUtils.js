import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export const DRAFT_KEY = "explore-composer-draft";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 15;

let ffmpeg = null;
let ffmpegLoading = null;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function getRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  return [
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const instance = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

    await instance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpeg = instance;
    return instance;
  })();

  return ffmpegLoading;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file?.size > MAX_MEDIA_BYTES) {
      reject(new Error("This media is too large. Please choose a video under 100MB."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration || 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to inspect this video."));
    };
    video.src = url;
  });
}

export async function trimVideoFileToDataUrl(file, startSeconds = 0, durationSeconds = MAX_VIDEO_SECONDS) {
  const shouldTryNativeFirst = isMobileBrowser();

  if (shouldTryNativeFirst) {
    try {
      return await trimVideoWithNativeRecorder(file, startSeconds, durationSeconds);
    } catch (error) {
      console.warn("[KunThai Native Trim Attempt Failed]", error);
    }
  }

  try {
    const instance = await getFFmpeg();

    const inputName = `input-${Date.now()}.mp4`;
    const outputName = `clip-${Date.now()}.mp4`;
    const safeStart = Math.max(0, Number(startSeconds || 0));
    const safeDuration = Math.max(1, Math.min(Number(durationSeconds || MAX_VIDEO_SECONDS), MAX_VIDEO_SECONDS));

    await instance.writeFile(inputName, await fetchFile(file));

    await instance.exec([
      "-i",
      inputName,
      "-ss",
      String(safeStart),
      "-t",
      String(safeDuration),
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      "scale='min(720,iw)':-2,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-avoid_negative_ts",
      "make_zero",
      outputName,
    ]);

    const data = await instance.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "video/mp4" });

    try {
      await instance.deleteFile(inputName);
      await instance.deleteFile(outputName);
    } catch {
      // ignore cleanup errors
    }

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to save trimmed video."));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[KunThai FFmpeg Trim Error]", error);

    if (!shouldTryNativeFirst) {
      try {
        return await trimVideoWithNativeRecorder(file, startSeconds, durationSeconds);
      } catch (nativeError) {
        console.warn("[KunThai Native Trim Attempt Failed]", nativeError);
      }
    }

    throw new Error("Unable to prepare this video. Please try another clip or choose a shorter video.");
  }
}

async function trimVideoWithNativeRecorder(file, startSeconds = 0, durationSeconds = MAX_VIDEO_SECONDS) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Native video recording is unavailable.");
  }

  const mimeType = getRecordingMimeType();
  if (!mimeType) throw new Error("No supported video recording format.");

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const safeStart = Math.max(0, Number(startSeconds || 0));
  const safeDuration = Math.max(1, Math.min(Number(durationSeconds || MAX_VIDEO_SECONDS), MAX_VIDEO_SECONDS));
  let stream = null;
  let recorder = null;
  let frameId = null;

  if (!ctx || typeof canvas.captureStream !== "function") {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Video canvas capture is unavailable.");
  }

  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Video metadata timed out.")), 8000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Unable to read selected video."));
      };
      video.load();
    });

    canvas.width = Math.min(video.videoWidth || 720, 720);
    canvas.height = Math.max(2, Math.round(canvas.width * ((video.videoHeight || 720) / (video.videoWidth || 720))));

    video.currentTime = Math.min(safeStart, Math.max(0, (video.duration || safeDuration) - 0.2));
    await new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 1200);
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });

    stream = canvas.captureStream(24);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType });
    const recorded = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Unable to record trimmed video."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
    });

    let stopped = false;
    const startedAt = performance.now();
    const stopAt = Math.min(video.duration || safeStart + safeDuration, safeStart + safeDuration);

    function drawFrame() {
      if (stopped) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // A skipped frame is better than failing the prepared clip.
      }

      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      if (video.currentTime >= stopAt || elapsedSeconds >= safeDuration + 0.35) {
        stopped = true;
        video.pause();
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }

      frameId = requestAnimationFrame(drawFrame);
    }

    recorder.start(250);
    await video.play();
    drawFrame();
    await sleep((safeDuration + 0.6) * 1000);
    if (!stopped && recorder.state !== "inactive") {
      stopped = true;
      video.pause();
      recorder.stop();
    }

    const blob = await recorded;

    if (!blob.size) throw new Error("The trimmed video was empty.");

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to save trimmed video."));
      reader.readAsDataURL(blob);
    });
  } finally {
    if (frameId) cancelAnimationFrame(frameId);
    if (recorder?.state && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be stopped.
      }
    }
    stream?.getTracks?.().forEach((track) => track.stop());
    video.pause();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function extractVideoFramesFromDataUrl(videoDataUrl, count = 3) {
  return new Promise((resolve) => {
    if (!videoDataUrl) {
      resolve([]);
      return;
    }

    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames = [];

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;

      if (!duration || !ctx) {
        resolve([]);
        return;
      }

      canvas.width = Math.min(video.videoWidth || 720, 720);
      canvas.height = Math.round(canvas.width * ((video.videoHeight || 720) / (video.videoWidth || 720)));

      const times = [
        Math.max(0.3, duration * 0.15),
        Math.max(0.6, duration * 0.5),
        Math.max(0.9, duration * 0.85),
      ].slice(0, count);

      let index = 0;

      function captureNext() {
        if (index >= times.length) {
          resolve(frames);
          return;
        }

        video.currentTime = Math.min(times[index], Math.max(0, duration - 0.2));
      }

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          // skip frame
        }

        index += 1;
        captureNext();
      };

      captureNext();
    };

    video.onerror = () => resolve([]);
    video.src = videoDataUrl;
  });
}

export function parseTags(value) {
  const text = String(value || "");
  const hashtags = Array.from(new Set((text.match(/#[a-z0-9_]+/gi) || []).map((tag) => tag.slice(1).toLowerCase())));
  const mentions = Array.from(new Set((text.match(/@[a-z0-9_]+/gi) || []).map((tag) => tag.slice(1).toLowerCase())));

  return { hashtags, mentions };
}

export function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");

    if (!draft || typeof draft !== "object") return {};

    return {
      ...draft,
      image_url: "",
      video_url: "",
      audio_url: "",
    };
  } catch {
    return {};
  }
}

export function writeDraft(draft) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...draft,
        image_url: "",
        video_url: "",
        audio_url: "",
      })
    );
  } catch {
    // ignore storage limit
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
