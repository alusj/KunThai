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

export function playExploreMedia(media) {
  if (!media) {
    return Promise.resolve();
  }

  pauseOtherExploreMedia(media);
  return media.play();
}
