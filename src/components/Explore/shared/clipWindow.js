// A post's video can be a longer original file played only between a start and
// an end time (an instant trim: no re-encoding on the phone). Every player
// keeps playback inside that window.

export const MAX_CLIP_SECONDS = 15;

// { start, end } inside the real duration (when known), at most `maxSeconds`
// long and at least half a second.
export function clipWindow(rawStart, rawEnd, duration = 0, maxSeconds = MAX_CLIP_SECONDS) {
  const known = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 0;
  const startValue = Number(rawStart);
  const start = Math.max(0, Math.min(Number.isFinite(startValue) ? startValue : 0, known ? Math.max(0, known - 0.25) : Infinity));
  const endValue = rawEnd == null || rawEnd === "" ? Number.NaN : Number(rawEnd);
  const requestedEnd = Number.isFinite(endValue) ? endValue : start + maxSeconds;
  const limit = known || start + maxSeconds;
  const end = Math.min(limit, Math.max(start + 0.5, requestedEnd), start + maxSeconds);
  return { start, end };
}

// The trim window stored on a post, whichever shape the post came in.
export function postClipRange(post) {
  return {
    start: post?.video_trim_start ?? post?.videoTrimStart ?? post?.media_meta?.videoTrimStart ?? post?.mediaMeta?.videoTrimStart ?? 0,
    end: post?.video_trim_end ?? post?.videoTrimEnd ?? post?.media_meta?.videoTrimEnd ?? post?.mediaMeta?.videoTrimEnd ?? null,
  };
}

// Video element handlers that keep playback inside the window and loop it.
export function clipWindowHandlers(rawStart, rawEnd, maxSeconds = MAX_CLIP_SECONDS) {
  const windowFor = (video) => clipWindow(rawStart, rawEnd, video?.duration, maxSeconds);
  return {
    onLoadedMetadata: (event) => {
      const video = event.currentTarget;
      const { start } = windowFor(video);
      if (start > 0 && Math.abs(video.currentTime - start) > 0.2) video.currentTime = start;
    },
    onTimeUpdate: (event) => {
      const video = event.currentTarget;
      const { start, end } = windowFor(video);
      if (video.currentTime >= end - 0.05 || video.currentTime < start - 0.3) {
        video.currentTime = start;
        if (!video.paused || video.loop) video.play?.().catch?.(() => {});
      }
    },
  };
}
