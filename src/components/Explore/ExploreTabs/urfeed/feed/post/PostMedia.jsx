import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowLeft, HiOutlineXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { pauseOtherExploreMedia, playExploreMedia, stopAllExploreMedia } from "../../../../shared/singleMediaPlayback";

export default function PostMedia({ post }) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const audioRef = useRef(null);
  const videoRef = useRef(null);

  useBrowserBack(imagePreviewOpen, () => setImagePreviewOpen(false), `image-preview-${post.id}`);

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
    return () => {
      observer.disconnect();
      media.pause();
    };
  }, [post.audio_url, post.video_url]);

  useEffect(() => () => stopAllExploreMedia(), []);

  return (
    <>
      {post.image_url ? (
        <div className="max-w-full overflow-hidden px-4 pb-4">
          <button
            type="button"
            onClick={() => setImagePreviewOpen(true)}
            className="block w-full overflow-hidden rounded-[20px] bg-slate-100 text-left"
            aria-label="Preview image"
          >
            <img src={post.image_url} alt="Post attachment" className="max-h-[520px] w-full max-w-full object-cover" />
          </button>
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

      {imagePreviewOpen ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950">
          <div className="flex h-16 flex-none items-center justify-between px-3 text-white">
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl backdrop-blur"
              aria-label="Back to feed"
            >
              <HiOutlineArrowLeft />
            </button>
            <p className="truncate px-3 text-sm font-black">Image preview</p>
            <button
              type="button"
              onClick={() => setImagePreviewOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl backdrop-blur"
              aria-label="Close image preview"
            >
              <HiOutlineXMark />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setImagePreviewOpen(false)}
            className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4"
            aria-label="Close image preview and return to feed"
          >
            <img
              src={post.image_url}
              alt="Post attachment full preview"
              className="max-h-full max-w-full object-contain"
            />
          </button>
        </div>
      ) : null}
    </>
  );
}
