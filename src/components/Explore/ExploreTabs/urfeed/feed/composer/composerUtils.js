import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export const DRAFT_KEY = "explore-composer-draft";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 15;

let ffmpeg = null;
let ffmpegLoading = null;

function logComposerMedia(level, event, error) {
  if (import.meta.env.DEV) {
    console[level](`[KunThai Composer] ${event}`, error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function getRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  return [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to save trimmed video."));
    reader.readAsDataURL(blob);
  });
}

function waitForMediaEvent(target, eventName, timeoutMs, failureEventName = "error") {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video processing timed out."));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      target.removeEventListener(eventName, handleSuccess);
      target.removeEventListener(failureEventName, handleFailure);
    }

    function handleSuccess() {
      cleanup();
      resolve();
    }

    function handleFailure() {
      cleanup();
      reject(new Error("Unable to read selected video."));
    }

    target.addEventListener(eventName, handleSuccess, { once: true });
    target.addEventListener(failureEventName, handleFailure, { once: true });
  });
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
  const preferNative = isMobileBrowser();

  if (preferNative) {
    try {
      return await trimVideoWithNativeRecorder(file, startSeconds, durationSeconds);
    } catch (error) {
      logComposerMedia("warn", "native trim attempt failed", error);
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
      "-y",
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
    return await blobToDataUrl(blob);
  } catch (error) {
    logComposerMedia("error", "FFmpeg trim failed", error);

    if (!preferNative) {
      try {
        return await trimVideoWithNativeRecorder(file, startSeconds, durationSeconds);
      } catch (nativeError) {
        logComposerMedia("warn", "native trim attempt failed", nativeError);
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
  if (!mimeType) {
    throw new Error("No supported video recording format.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const safeStart = Math.max(0, Number(startSeconds || 0));
  const safeDuration = Math.max(1, Math.min(Number(durationSeconds || MAX_VIDEO_SECONDS), MAX_VIDEO_SECONDS));
  let stream = null;
  let recorder = null;
  let frameId = null;
  let stopTimer = null;

  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  try {
    video.load();
    await waitForMediaEvent(video, "loadedmetadata", 10000);

    const videoWidth = video.videoWidth || 720;
    const videoHeight = video.videoHeight || 1280;
    const maxWidth = 720;
    canvas.width = Math.min(videoWidth, maxWidth);
    canvas.height = Math.max(2, Math.round(canvas.width * (videoHeight / videoWidth)));

    const endTime = Math.min(video.duration || safeStart + safeDuration, safeStart + safeDuration);
    video.currentTime = Math.min(safeStart, Math.max(0, (video.duration || safeDuration) - 0.25));
    await waitForMediaEvent(video, "seeked", 6000).catch(() => {});

    const captureStream = video.captureStream?.bind(video) || video.mozCaptureStream?.bind(video);
    stream = captureStream?.();

    if (!stream?.getVideoTracks?.().length) {
      if (!ctx || typeof canvas.captureStream !== "function") {
        throw new Error("Video capture is unavailable.");
      }
      stream = canvas.captureStream(24);
    }

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
    function stopRecording() {
      if (stopped) return;
      stopped = true;
      video.pause();
      if (recorder?.state && recorder.state !== "inactive") recorder.stop();
    }

    function drawFrame() {
      if (stopped || !ctx) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // A dropped frame should not fail the final clip.
      }

      if (video.currentTime >= endTime) {
        stopRecording();
        return;
      }

      frameId = requestAnimationFrame(drawFrame);
    }

    recorder.start(250);
    await video.play();
    if (!stream.getVideoTracks?.().length || stream.getVideoTracks()[0]?.label?.toLowerCase?.().includes("canvas")) {
      drawFrame();
    } else if (ctx) {
      drawFrame();
    }

    stopTimer = window.setTimeout(stopRecording, (safeDuration + 0.45) * 1000);
    await Promise.race([
      recorded,
      sleep((safeDuration + 1) * 1000).then(() => {
        stopRecording();
        return recorded;
      }),
    ]);

    const blob = await recorded;
    if (!blob.size) throw new Error("The trimmed video was empty.");
    return await blobToDataUrl(blob);
  } finally {
    window.clearTimeout(stopTimer);
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

export async function extractVideoFramesFromDataUrl(videoDataUrl, count = 3, options = {}) {
  return new Promise((resolve) => {
    if (!videoDataUrl) {
      resolve([]);
      return;
    }

    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames = [];
    const frameCount = Math.max(1, Math.min(6, Math.round(Number(count || 3))));
    let settled = false;
    let timeoutId = null;

    function cleanup() {
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    }

    function finish() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(frames);
    }

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = video.duration || 0;

      if (!duration || !ctx) {
        finish();
        return;
      }

      canvas.width = Math.min(video.videoWidth || 720, 720);
      canvas.height = Math.round(canvas.width * ((video.videoHeight || 720) / (video.videoWidth || 720)));

      const requestedStart = Math.max(0, Number(options.start || 0));
      const requestedEnd = Number(options.end || 0);
      const sampleStart = Math.min(requestedStart, Math.max(0, duration - 0.2));
      const sampleEnd = Math.min(
        duration,
        requestedEnd > sampleStart ? requestedEnd : duration,
        sampleStart + MAX_VIDEO_SECONDS,
      );
      const sampleSpan = Math.max(0.2, sampleEnd - sampleStart);
      const times = Array.from({ length: frameCount }, (_, index) => {
        const ratio = (index + 0.5) / frameCount;
        return Math.min(sampleStart + sampleSpan * ratio, Math.max(0, duration - 0.1));
      });

      let index = 0;

      function captureNext() {
        if (index >= times.length) {
          finish();
          return;
        }

        video.currentTime = Math.min(times[index], Math.max(0, duration - 0.2));
      }

      video.onseeked = () => {
        window.requestAnimationFrame(() => {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL("image/jpeg", 0.82));
          } catch {
            // Skip unreadable frames and let the caller require a usable review sample.
          }

          index += 1;
          captureNext();
        });
      };

      captureNext();
    };

    timeoutId = window.setTimeout(finish, 12_000);
    video.onerror = finish;
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
