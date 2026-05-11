export function pauseOtherExploreMedia(activeMedia) {
  if (!activeMedia || typeof document === "undefined") {
    return;
  }

  document.querySelectorAll("audio, video").forEach((media) => {
    if (media !== activeMedia && !media.paused) {
      media.pause();
    }
  });
}

export function stopAllExploreMedia(exceptMedia = null) {
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll("audio, video").forEach((media) => {
    if (media === exceptMedia) {
      return;
    }

    media.pause();
    if (!Number.isNaN(media.currentTime)) {
      media.currentTime = 0;
    }
  });
}

export function playExploreMedia(media) {
  if (!media) {
    return Promise.resolve();
  }

  pauseOtherExploreMedia(media);
  return media.play();
}
