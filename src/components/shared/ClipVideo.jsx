import { parseClipFragment } from "../../Backend/services/media/videoClipUrl";

// A <video> for an UrMall video URL. An instantly trimmed video is the full
// original with its window on the URL ("#t=start,end"): playback starts at the
// window, stops at its end, and replays from its start. A URL without a window
// plays exactly as a plain <video>.
export default function ClipVideo({ src, ...props }) {
  const clip = parseClipFragment(src);
  if (!clip) return <video src={src} {...props} />;

  const { start } = clip;
  const end = clip.end ?? Infinity;

  function keepInside(video) {
    if (video.currentTime < start - 0.3 || video.currentTime >= end - 0.05) video.currentTime = start;
  }

  return (
    <video
      src={src}
      {...props}
      onLoadedMetadata={(event) => {
        if (start > 0 && Math.abs(event.currentTarget.currentTime - start) > 0.2) event.currentTarget.currentTime = start;
        props.onLoadedMetadata?.(event);
      }}
      onPlay={(event) => {
        keepInside(event.currentTarget);
        props.onPlay?.(event);
      }}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (video.currentTime >= end - 0.05) {
          video.pause();
          video.currentTime = start;
        } else if (video.currentTime < start - 0.3) {
          video.currentTime = start;
        }
        props.onTimeUpdate?.(event);
      }}
    />
  );
}
