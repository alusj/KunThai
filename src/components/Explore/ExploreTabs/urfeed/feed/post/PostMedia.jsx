import { useEffect, useRef } from "react";

import { pauseOtherExploreMedia, playExploreMedia } from "../../../../shared/singleMediaPlayback";

export default function PostMedia({ post }) {
  const audioRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const media = post.video_url ? videoRef.current : audioRef.current;

    if (!media) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          playExploreMedia(media).catch(() => {});
          return;
        }

        media.pause();
      },
      { threshold: 0.6 },
    );

    observer.observe(media);
    return () => observer.disconnect();
  }, [post.audio_url, post.video_url]);

  return (
    <>
      {post.image_url ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          <img src={post.image_url} alt="Post attachment" className="max-h-[520px] w-full max-w-full rounded-[20px] object-cover" />
        </div>
      ) : null}

      {post.video_url ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          <video
            ref={videoRef}
            autoPlay
            controls
            loop
            muted
            onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
            playsInline
            src={post.video_url}
            className="max-h-[520px] w-full max-w-full rounded-[20px] bg-slate-950 object-cover"
          />
        </div>
      ) : null}

      {post.audio_url ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-bold text-slate-900">Voice note</p>
            <audio
              ref={audioRef}
              autoPlay
              controls
              preload="auto"
              src={post.audio_url}
              onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
              className="w-full"
            />
            {post.audio_duration_seconds ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">{post.audio_duration_seconds}s</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
