export const DRAFT_KEY = "explore-composer-draft";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 15;

export function shouldSkipBrowserVideoProcessing() {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(userAgent) &&
    /Apple/i.test(vendor || userAgent);

  return isIOS || isSafari;
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

export function prepareImageReviewDataUrl(file, maxDimension = 1280) {
  if (!file?.type?.startsWith?.("image/")) return fileToDataUrl(file);

  return new Promise((resolve) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();

    function fallback() {
      URL.revokeObjectURL(sourceUrl);
      fileToDataUrl(file).then(resolve).catch(() => resolve(""));
    }

    image.onload = () => {
      try {
        const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
        const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
        const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          fallback();
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(sourceUrl);
        resolve(dataUrl);
      } catch {
        fallback();
      }
    };
    image.onerror = fallback;
    image.src = sourceUrl;
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

export async function extractVideoFramesFromDataUrl(videoDataUrl, count = 3, options = {}) {
  return new Promise((resolve) => {
    if (!videoDataUrl || shouldSkipBrowserVideoProcessing()) {
      resolve([]);
      return;
    }

    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames = [];
    const frameCount = Math.max(1, Math.min(3, Math.round(Number(count || 3))));
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

      canvas.width = Math.min(video.videoWidth || 480, 480);
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
            frames.push(canvas.toDataURL("image/jpeg", 0.68));
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
