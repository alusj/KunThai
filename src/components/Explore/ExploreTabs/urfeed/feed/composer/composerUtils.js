export const DRAFT_KEY = "explore-composer-draft";
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 15;

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

export function trimVideoFileToDataUrl(file, startSeconds = 0, durationSeconds = MAX_VIDEO_SECONDS) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === "undefined") {
      reject(new Error("Video trimming is not supported on this browser. Please choose a video under 15 seconds."));
      return;
    }

    const mimeType = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find((type) => MediaRecorder.isTypeSupported?.(type));

    if (!mimeType) {
      reject(new Error("Video trimming is not supported on this browser. Please choose a video under 15 seconds."));
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const chunks = [];
    let recorder = null;
    let stopTimer = 0;
    let animationFrame = 0;
    let audioContext = null;

    function cleanup() {
      window.clearTimeout(stopTimer);
      window.cancelAnimationFrame(animationFrame);
      audioContext?.close?.().catch(() => {});
      URL.revokeObjectURL(url);
      video.pause();
      video.src = "";
    }

    function drawFrame() {
      if (!video.paused && !video.ended) {
        context?.drawImage(video, 0, 0, canvas.width, canvas.height);
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    }

    video.muted = false;
    video.volume = 0.01;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      canvas.width = Math.min(video.videoWidth || 720, 1280);
      canvas.height = Math.round(canvas.width * ((video.videoHeight || 720) / (video.videoWidth || 720)));
      video.currentTime = Math.max(0, Math.min(startSeconds, Math.max(0, video.duration - 0.5)));
    };
    video.onseeked = async () => {
      try {
        let stream = null;
        if (typeof video.captureStream === "function") {
          stream = video.captureStream();
        } else if (typeof canvas.captureStream === "function") {
          const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
          stream = canvas.captureStream(30);

          if (AudioContextCtor) {
            audioContext = new AudioContextCtor();
            const source = audioContext.createMediaElementSource(video);
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);
            destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
          }
        }

        if (!stream) {
          cleanup();
          reject(new Error("This browser cannot prepare a 15 second clip. Try a shorter video."));
          return;
        }

        recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (event) => {
          if (event.data?.size) chunks.push(event.data);
        };
        recorder.onerror = () => {
          cleanup();
          reject(new Error("Unable to trim this video."));
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" });
          const reader = new FileReader();
          reader.onload = () => {
            cleanup();
            resolve(String(reader.result || ""));
          };
          reader.onerror = () => {
            cleanup();
            reject(new Error("Unable to save trimmed video."));
          };
          reader.readAsDataURL(blob);
        };

        recorder.start();
        await video.play();
        if (typeof video.captureStream !== "function") {
          drawFrame();
        }
        stopTimer = window.setTimeout(() => {
          if (recorder?.state === "recording") recorder.stop();
        }, durationSeconds * 1000);
      } catch {
        cleanup();
        reject(new Error("Unable to trim this video."));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Unable to load this video for trimming."));
    };
    video.src = url;
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
