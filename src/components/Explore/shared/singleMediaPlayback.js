// Voice comments (playing or recording) "duck" playing videos instead of
// stopping them: volume drops while the voice is heard and comes back after.
// iOS ignores video.volume, so there the video pauses and resumes instead.
const DUCK_VOLUME = { playback: 0.18, recording: 0.06 };
const duckSources = new Map(); // source key/element -> "playback" | "recording"
const duckedVideos = new Map(); // video -> { volume, target } | { paused: true }

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

function duckVideo(video) {
  const known = duckedVideos.get(video);
  if (known?.paused) return;
  if (!known && !isAudible(video)) return;

  const volume = known ? known.volume : video.volume;
  const target = Math.min(volume, duckTarget());
  try {
    video.volume = target;
  } catch {
    // Some engines throw on volume writes.
  }

  if (Math.abs(video.volume - target) < 0.01) {
    duckedVideos.set(video, { volume, target });
    return;
  }

  // Volume is fixed by the platform (iOS): pause now, resume on release.
  try {
    video.volume = volume;
  } catch {
    // Ignore.
  }
  video.pause();
  duckedVideos.set(video, { paused: true });
}

// Volume-only duck for a video the person just started. Never pauses it.
function duckVideoVolumeOnly(video) {
  if (video.muted || video.volume === 0) return true;
  const volume = video.volume;
  const target = Math.min(volume, duckTarget());
  try {
    video.volume = target;
  } catch {
    // Ignore.
  }
  if (Math.abs(video.volume - target) < 0.01) {
    duckedVideos.set(video, { volume, target });
    return true;
  }
  return false;
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
    if (typeof source !== "object" || !source) return;
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
