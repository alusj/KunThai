// Trimming a clip in the browser, with a strategy for each engine KunThai runs on.
//
// The old trimmer only knew one way to do this: play the clip and record
// `video.captureStream()` with MediaRecorder. That API does not exist in Safari
// or in the iOS WKWebView the KunThai app runs inside, so trimming simply
// refused to work there ("not supported in this browser"). The strategies below
// are tried in order, so a device that cannot do one can still do another:
//
//   1. copy    — the selection is the whole clip and it already fits the limits,
//                so the original file is kept as-is (instant, no quality loss).
//   2. element — MediaRecorder over video.captureStream() (Chrome, Firefox,
//                Android WebView). Highest fidelity of the re-encoding paths.
//   3. canvas  — frames drawn to a canvas and recorded from canvas.captureStream(),
//                with audio routed through WebAudio. This is the path that makes
//                trimming work in Safari and on iPhone.
//
// Every path re-checks the duration and size limits before returning.

const MIN_CLIP_SECONDS = 1;
const MAX_RECORDING_BITS_PER_SECOND = 8_000_000;
const SEEK_TIMEOUT_MS = 8_000;
// Playback that does not advance for this long means recording cannot finish
// (a backgrounded tab, or a decoder that refuses the file).
const STALL_LIMIT_MS = 12_000;

export class VideoTrimError extends Error {
  constructor(message, code = "TRIM_FAILED") {
    super(message);
    this.name = "VideoTrimError";
    this.code = code;
  }
}

function hasMediaRecorder() {
  return typeof MediaRecorder !== "undefined";
}

function supportsElementCapture() {
  if (typeof HTMLVideoElement === "undefined") return false;
  const proto = HTMLVideoElement.prototype;
  return typeof (proto.captureStream || proto.mozCaptureStream) === "function";
}

function supportsCanvasCapture() {
  return typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

/** Which engine this browser can trim with, for messaging and tests. */
export function describeTrimSupport() {
  if (!hasMediaRecorder()) return { strategy: "none", reason: "no-media-recorder" };
  if (supportsElementCapture()) return { strategy: "element", reason: "" };
  if (supportsCanvasCapture()) return { strategy: "canvas", reason: "" };
  return { strategy: "none", reason: "no-capture-stream" };
}

export function canTrimVideos() {
  return describeTrimSupport().strategy !== "none";
}

export function pickRecorderMimeType() {
  if (!hasMediaRecorder()) return "";
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function trimmedFileName(originalName, mimeType) {
  const base = String(originalName || "kunthai-video").replace(/\.[^.]+$/, "");
  const extension = String(mimeType || "").includes("mp4") ? "mp4" : "webm";
  return `${base}-trimmed.${extension}`;
}

export function formatVideoMb(bytes) {
  const mb = Number(bytes || 0) / (1024 * 1024);
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
}

function captureElementStream(video) {
  if (typeof video.captureStream === "function") return video.captureStream();
  if (typeof video.mozCaptureStream === "function") return video.mozCaptureStream();
  throw new VideoTrimError("This browser cannot record from a video element.", "NO_ELEMENT_CAPTURE");
}

function seekTo(video, seconds) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new VideoTrimError("The video took too long to seek.", "SEEK_TIMEOUT")), SEEK_TIMEOUT_MS);
    function done() {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    }
    video.addEventListener("seeked", done);
    video.currentTime = seconds;
  });
}

/**
 * Watch playback between `start` and `end`, reporting progress, and resolve
 * with `true` when playback stalls instead of hanging forever. An interval is
 * used alongside the media events because requestAnimationFrame is frozen in a
 * hidden tab.
 */
function watchPlayback(video, { start, end, seconds, onProgress, isCancelled }) {
  return new Promise((resolve) => {
    let intervalId = 0;
    let lastTime = video.currentTime;
    let stalledFor = 0;

    function finish(stalled) {
      window.clearInterval(intervalId);
      video.removeEventListener("timeupdate", check);
      video.removeEventListener("ended", check);
      resolve(stalled);
    }

    function check() {
      if (isCancelled()) {
        finish(false);
        return;
      }
      const played = Math.min(Math.max(video.currentTime - start, 0), seconds);
      onProgress?.(seconds > 0 ? played / seconds : 0);
      if (video.currentTime >= end || video.ended) {
        finish(false);
        return;
      }
      if (video.currentTime === lastTime) {
        stalledFor += 300;
        if (stalledFor >= STALL_LIMIT_MS) finish(true);
      } else {
        stalledFor = 0;
        lastTime = video.currentTime;
      }
    }

    video.addEventListener("timeupdate", check);
    video.addEventListener("ended", check);
    intervalId = window.setInterval(check, 300);
    check();
  });
}

async function recordStream(stream, { mimeType, seconds, targetBytes, onStart, onStop }) {
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: Math.min(
      MAX_RECORDING_BITS_PER_SECOND,
      Math.max(600_000, Math.floor((targetBytes * 8) / Math.max(seconds, MIN_CLIP_SECONDS))),
    ),
  });
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  const finished = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = () => reject(new VideoTrimError("Recording the clip failed.", "RECORDER_ERROR"));
  });

  recorder.start(250);
  try {
    await onStart(recorder);
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
  }
  await finished;
  onStop?.();
  return { chunks, outputType: recorder.mimeType || mimeType || chunks[0]?.type || "video/webm" };
}

/** Chrome / Firefox / Android: record the video element's own stream. */
async function trimWithElementCapture({ video, start, end, seconds, mimeType, targetBytes, onProgress, session }) {
  video.muted = true;
  await seekTo(video, start);
  const stream = captureElementStream(video);

  const { chunks, outputType } = await recordStream(stream, {
    mimeType,
    seconds,
    targetBytes,
    onStart: async () => {
      await video.play();
      const stalled = await watchPlayback(video, { start, end, seconds, onProgress, isCancelled: () => session.cancelled });
      video.pause();
      if (stalled) throw new VideoTrimError("Trimming stopped because the video would not play. Keep this screen open and try again.", "PLAYBACK_STALLED");
    },
  });
  return { chunks, outputType };
}

/**
 * Safari / iOS: draw each frame onto a canvas and record that, with the audio
 * track taken from WebAudio. `captureStream` on a canvas and
 * MediaStreamAudioDestinationNode are both supported there.
 */
// An element may only be passed to createMediaElementSource once, so the node
// is kept for the life of that element and reused on a second trim.
const audioGraphs = new WeakMap();

function buildAudioGraph(video) {
  if (audioGraphs.has(video)) return audioGraphs.get(video);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const source = context.createMediaElementSource(video);
  const destination = context.createMediaStreamDestination();
  source.connect(destination);
  // Keep the clip silent to the person while it records, without breaking the graph.
  const silence = context.createGain();
  silence.gain.value = 0;
  source.connect(silence);
  silence.connect(context.destination);
  const graph = { context, destination };
  audioGraphs.set(video, graph);
  return graph;
}

async function trimWithCanvasCapture({ video, start, end, seconds, mimeType, targetBytes, onProgress, session }) {
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 1280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new VideoTrimError("This device cannot prepare the video canvas.", "NO_CANVAS_CONTEXT");

  const stream = canvas.captureStream(30);

  // Audio is optional: a silent clip is better than no trimming at all, so a
  // device that refuses the audio graph still gets its video.
  try {
    const graph = buildAudioGraph(video);
    if (graph) {
      if (graph.context.state === "suspended") await graph.context.resume();
      graph.destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }
  } catch {
    // Recorded without sound.
  }

  video.muted = false;
  video.volume = 1;
  await seekTo(video, start);

  let drawing = true;
  function drawFrame() {
    if (!drawing) return;
    try {
      context.drawImage(video, 0, 0, width, height);
    } catch {
      // A frame that cannot be drawn (rare decoder hiccup) is skipped.
    }
    if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(drawFrame);
    else window.requestAnimationFrame(drawFrame);
  }

  const { chunks, outputType } = await recordStream(stream, {
    mimeType,
    seconds,
    targetBytes,
    onStart: async () => {
      drawFrame();
      // A timer keeps frames flowing even if rAF is throttled while hidden.
      const ticker = window.setInterval(() => {
        try {
          context.drawImage(video, 0, 0, width, height);
        } catch {
          // Ignored, as above.
        }
      }, 100);
      try {
        await video.play();
        const stalled = await watchPlayback(video, { start, end, seconds, onProgress, isCancelled: () => session.cancelled });
        video.pause();
        if (stalled) throw new VideoTrimError("Trimming stopped because the video would not play. Keep this screen open and try again.", "PLAYBACK_STALLED");
      } finally {
        window.clearInterval(ticker);
      }
    },
    onStop: () => {
      drawing = false;
    },
  });

  return { chunks, outputType };
}

/**
 * Trim `file` to the selected range.
 *
 * @param {File} file
 * @param {object} options
 * @param {HTMLVideoElement} options.video   A loaded element showing `file`.
 * @param {number} options.startSeconds
 * @param {number} options.endSeconds
 * @param {number} options.maxSeconds
 * @param {number} options.maxBytes
 * @param {(fraction: number) => void} [options.onProgress]
 * @param {{ cancelled: boolean }} [options.session]
 * @returns {Promise<{ file: File, durationSeconds: number, strategy: string }>}
 */
export async function trimVideoFile(file, {
  video,
  startSeconds,
  endSeconds,
  maxSeconds,
  maxBytes,
  onProgress,
  session = { cancelled: false },
  strategy: forcedStrategy = "",
} = {}) {
  const start = Math.max(0, Number(startSeconds) || 0);
  const end = Math.max(start, Number(endSeconds) || 0);
  const seconds = Math.max(end - start, MIN_CLIP_SECONDS);
  const duration = Number(video?.duration) || 0;

  if (seconds > maxSeconds + 0.05) {
    throw new VideoTrimError(`Choose at most ${maxSeconds} seconds.`, "CLIP_TOO_LONG");
  }

  // Nothing was actually cut and the file already fits: keep the original,
  // which is instant and loses no quality.
  const wholeClip = start <= 0.05 && (duration === 0 || end >= duration - 0.05);
  if (wholeClip && file.size <= maxBytes && (duration === 0 || duration <= maxSeconds + 0.05)) {
    return { file, durationSeconds: duration || seconds, strategy: "copy" };
  }

  const support = forcedStrategy ? { strategy: forcedStrategy, reason: "forced" } : describeTrimSupport();
  if (support.strategy === "none") {
    throw new VideoTrimError(
      "This browser cannot trim video. Trim the clip in your phone's gallery app and upload it again.",
      "UNSUPPORTED",
    );
  }

  const mimeType = pickRecorderMimeType();
  const targetBytes = Math.max(1, maxBytes - 2 * 1024 * 1024);
  const runner = support.strategy === "element" ? trimWithElementCapture : trimWithCanvasCapture;

  let result;
  try {
    result = await runner({ video, start, end, seconds, mimeType, targetBytes, onProgress, session });
  } catch (error) {
    // An element-capture failure on a browser that also has canvas capture is
    // worth one retry through the canvas path before giving up.
    if (support.strategy === "element" && supportsCanvasCapture() && error?.code !== "PLAYBACK_STALLED" && !session.cancelled) {
      result = await trimWithCanvasCapture({ video, start, end, seconds, mimeType, targetBytes, onProgress, session });
    } else {
      throw error;
    }
  }

  if (session.cancelled) throw new VideoTrimError("Trimming was cancelled.", "CANCELLED");

  const blob = new Blob(result.chunks, { type: result.outputType });
  if (!blob.size) throw new VideoTrimError("Trimming produced an empty clip. Please try again.", "EMPTY_OUTPUT");
  if (blob.size > maxBytes) {
    throw new VideoTrimError(
      `The trimmed clip is still ${formatVideoMb(blob.size)} MB. Trim a shorter part so it stays under ${formatVideoMb(maxBytes)} MB.`,
      "TOO_LARGE",
    );
  }

  return {
    // Plain container type ("video/mp4", not "video/mp4;codecs=avc1"): that is
    // what storage should record and what the Explore format check expects.
    file: new File([blob], trimmedFileName(file.name, result.outputType), { type: String(result.outputType).split(";")[0].trim() }),
    durationSeconds: seconds,
    strategy: support.strategy,
  };
}
