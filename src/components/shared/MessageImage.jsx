import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { resizedImageUrl } from "../../Backend/lib/imageProxy";
import ImageViewer from "./ImageViewer";

// A message-attachment image with a premium feel: a skeleton while it loads, a
// "Sending…" overlay for an in-flight upload, a graceful error state, and
// tap-to-open in the full-screen ImageViewer. Shared by UrFeed and UrMall
// messaging. Data-URL previews (optimistic sends) are shown as-is; stored URLs
// are served through the resize proxy at a thumbnail size to save data.
export default function MessageImage({ mediaUrl, alt = "Photo", pending = false, className = "" }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (!mediaUrl) return null;

  const isData = String(mediaUrl).startsWith("data:");
  const thumb = isData ? mediaUrl : resizedImageUrl(mediaUrl, { width: 720, quality: 74 });
  const full = isData ? mediaUrl : resizedImageUrl(mediaUrl, { width: 1600, quality: 88 });

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (!failed && !pending) setViewerOpen(true);
        }}
        aria-label="Open image"
        className={`group relative block w-full overflow-hidden rounded-2xl bg-slate-200/70 dark:bg-slate-700/40 ${className}`}
        style={{ minHeight: loaded || failed ? undefined : "9rem" }}
      >
        {!loaded && !failed ? (
          <span className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700/50" aria-hidden="true" />
        ) : null}

        {failed ? (
          <span className="flex h-36 w-full flex-col items-center justify-center gap-1.5 text-slate-400">
            <ImageOff size={22} />
            <span className="text-[11px] font-bold">Image unavailable</span>
          </span>
        ) : (
          <img
            src={thumb}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`max-h-72 w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )}

        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-950/35">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-black text-white">
              <Loader2 size={14} className="animate-spin" /> Sending…
            </span>
          </span>
        ) : null}
      </button>

      {viewerOpen ? <ImageViewer src={full} alt={alt} onClose={() => setViewerOpen(false)} /> : null}
    </>
  );
}
