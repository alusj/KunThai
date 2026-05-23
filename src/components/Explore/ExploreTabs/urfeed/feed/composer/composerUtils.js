import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export const DRAFT_KEY = "explore-composer-draft";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 15;

let ffmpeg = null;

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  await ffmpeg.load({
    coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
  });

  return ffmpeg;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file?.size > MAX_MEDIA_BYTES) {
      reject(new Error("This media is too large for the current uploader. Please choose a video under 100MB."));
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
  try {
    const ffmpeg = await getFFmpeg();

    const inputName = "input.mp4";
    const outputName = "output.mp4";

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      "-ss",
      String(startSeconds),
      "-i",
      inputName,
      "-t",
      String(durationSeconds),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);

    const blob = new Blob([data.buffer], {
      type: "video/mp4",
    });

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to save trimmed video."));

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(error);
    throw new Error("Unable to prepare this video. Please try another clip.");
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
          // skip bad frame
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

    if (!draft || typeof draft !== "object") {
      return {};
    }

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
    const safeDraft = {
      ...draft,
      image_url: "",
      video_url: "",
      audio_url: "",
    };

    localStorage.setItem(DRAFT_KEY, JSON.stringify(safeDraft));
  } catch {
    // Media can exceed browser storage limits, so drafts stay lightweight.
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}