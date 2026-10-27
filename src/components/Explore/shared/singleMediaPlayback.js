// Voice comments (playing or recording) "duck" playing videos instead of
// stopping them, and the video comes back to its own volume afterwards:
//   playing a voice comment  the video drops to 5%
//   recording one            the video is silenced (muted), so the mic hears
//                            only the voice; muting works everywhere, iOS too
// iOS ignores video.volume, so while a voice comment plays there the video
// pauses and resumes once it ends.
const DUCK_VOLUME = { playback: 0.05, recording: 0 };
const duckSources = new Map(); // source key/element -> "playback" | "recording"
// video -> { volume, target, muted? } | { paused: true }
const duckedVideos = new Map();

function duckTarget() {
  let target = DUCK_VOLUME.playback;
  duckSources.forEach((kind) => {
    target = Math.min(target, DUCK_VOLUME[kind] ?? DUCK_VOLUME.playback);
  });
  return target;
}

function isAudible(video) {
  return !video.paused && !video.ended && !video.muted && video.volume > 0;
}

function setVolume(video, value) {
  try {
    video.volume = value;
  } catch {
    // Some engines throw on volume writes.
  }
}

// Lowers `video` to the current target; false when the platform fixes the
// volume (iOS). `state` is what is already known about this video.
function lowerVolume(video, state) {
  const volume = state ? state.volume : video.volume;
  const target = Math.min(volume, duckTarget());
  if (state?.muted && video.muted) video.muted = false;
  setVolume(video, target);
  if (Math.abs(video.volume - target) < 0.01) {
    duckedVideos.set(video, { volume, target });
    return true;
  }
  setVolume(video, volume);
  return false;
}

function silence(video, state) {
  const volume = state ? state.volume : video.volume;
  video.muted = true;
  duckedVideos.set(video, { volume, target: state ? state.target : volume, muted: true });
}

function duckVideo(video) {
  const known = duckedVideos.get(video);
  if (known?.paused) return;
  if (!known && !isAudible(video)) return;

  if (duckTarget() === 0) {
    if (!known?.muted) silence(video, known);
    return;
  }
  if (lowerVolume(video, known)) return;

  // Volume is fixed by the platform (iOS): pause now, resume on release.
  if (known?.muted && video.muted) video.muted = false;
  video.pause();
  duckedVideos.set(video, { paused: true });
}

// Duck for a video the person just started. Never pauses it.
function duckVideoVolumeOnly(video) {
  if (video.muted || video.volume === 0) return true;
  if (duckTarget() === 0) {
    silence(video, null);
    return true;
  }
  return lowerVolume(video, null);
}

function duckAllVideos() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("video").forEach(duckVideo);
}

function restoreVideos() {
  duckedVideos.forEach((state, video) => {
    if (!video.isConnected) return;
    if (state.paused) {
      // Only resume a video the app still considers active.
      if (video.dataset.exploreActive !== "false" && video.paused) video.play().catch(() => {});
      return;
    }
    if (state.muted && video.muted) video.muted = false;
    // Leave the volume alone if something else changed it meanwhile.
    if (Math.abs(video.volume - state.target) < 0.01) {
      try {
        video.volume = state.volume;
      } catch {
        // Ignore.
      }
    }
  });
  duckedVideos.clear();
}

// An <audio> source removed from the page (comment drawer closed, preview
// cleared) never fires pause, so sources are swept while any are held.
let sweepTimer = 0;

function sweepSources() {
  duckSources.forEach((_, source) => {
    // Only media elements; a Web Audio note releases itself when it stops.
    if (typeof source !== "object" || !source || !("paused" in source)) return;
    if (!source.isConnected) source.pause?.();
    if (!source.isConnected || source.paused) releaseExploreVideoDuck(source);
  });
}

// Start ducking for `source` (an audio element or any stable key). Returns a
// release function; videos come back once every source has been released.
export function duckExploreVideos(source, kind = "playback") {
  if (!source) return () => {};
  duckSources.set(source, kind);
  duckAllVideos();
  if (!sweepTimer && typeof window !== "undefined") sweepTimer = window.setInterval(sweepSources, 1000);

  return () => releaseExploreVideoDuck(source);
}

export function releaseExploreVideoDuck(source) {
  if (!duckSources.delete(source)) return;
  if (duckSources.size) {
    duckAllVideos();
    return;
  }
  window.clearInterval(sweepTimer);
  sweepTimer = 0;
  restoreVideos();
}

// Handlers for a voice-comment <audio>: duck videos while it plays.
export const voiceCommentAudioHandlers = {
  onPlay(event) {
    const audio = event.currentTarget;
    pauseOtherExploreMedia(audio, { includeVideos: false });
    duckExploreVideos(audio, "playback");
  },
  onPause(event) {
    releaseExploreVideoDuck(event.currentTarget);
  },
  onEnded(event) {
    releaseExploreVideoDuck(event.currentTarget);
  },
};

// True while a voice comment is holding this video paused (iOS ducking):
// autoplay must not restart it underneath the voice.
export function isExploreVideoHeld(video) {
  return Boolean(video && duckedVideos.get(video)?.paused);
}

export function pauseOtherExploreMedia(activeMedia, { muteVideos = true, includeVideos = true } = {}) {
  if (!activeMedia || typeof document === "undefined") {
    return;
  }

  // A video starting (or looping) while a voice comment is heard stays ducked
  // and leaves the voice comment playing. Where volume is fixed (iOS) the
  // person chose the video, so the voice comment stops as before.
  let keepVoice = false;
  if (activeMedia.tagName === "VIDEO" && duckSources.size) {
    duckedVideos.delete(activeMedia);
    keepVoice = duckVideoVolumeOnly(activeMedia);
  }

  document.querySelectorAll("audio, video").forEach((media) => {
    if (media === activeMedia || media.paused) return;
    if (!includeVideos && media.tagName === "VIDEO") return;
    if (keepVoice && duckSources.has(media)) return;
    media.pause();
    if (muteVideos && media.tagName === "VIDEO") {
      media.muted = true;
    }
  });
}

export function stopAllExploreMedia(exceptMedia = null, { muteVideos = true } = {}) {
  if (typeof document === "undefined") {
    return;
  }

  duckSources.clear();
  duckedVideos.clear();
  window.clearInterval(sweepTimer);
  sweepTimer = 0;

  document.querySelectorAll("audio, video").forEach((media) => {
    if (media === exceptMedia) {
      return;
    }

    media.pause();
    if (muteVideos && media.tagName === "VIDEO") {
      media.muted = true;
    }
    if (!Number.isNaN(media.currentTime)) {
      media.currentTime = 0;
    }
  });
}

export function playExploreMedia(media, options) {
  if (!media) {
    return Promise.resolve();
  }

  pauseOtherExploreMedia(media, options);
  return media.play();
}
