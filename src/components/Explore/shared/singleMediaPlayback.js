export function pauseOtherExploreMedia(activeMedia, { muteVideos = true } = {}) {
  if (!activeMedia || typeof document === "undefined") {
    return;
  }

  document.querySelectorAll("audio, video").forEach((media) => {
    if (media !== activeMedia && !media.paused) {
      media.pause();
      if (muteVideos && media.tagName === "VIDEO") {
        media.muted = true;
      }
    }
  });
}

export function stopAllExploreMedia(exceptMedia = null, { muteVideos = true } = {}) {
  if (typeof document === "undefined") {
    return;
  }

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
