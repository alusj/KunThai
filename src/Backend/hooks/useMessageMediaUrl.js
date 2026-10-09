import { useEffect, useState } from "react";

import { getSignedMessageMedia, readSignedMessageMedia } from "../services/explore/messageService";
import { SIGNED_MEDIA_REFRESH_MARGIN_MS } from "../services/explore/messageInboxModels.js";

// The URL to show for a message's photo, voice note or video. Private media
// gets a cached signed link that is renewed shortly before it expires; data:
// previews and older public URLs pass straight through.
export function useMessageMediaUrl(mediaUrl = "") {
  const [entry, setEntry] = useState(() => readSignedMessageMedia(mediaUrl));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let timer = 0;
    setFailed(false);

    function schedule(nextEntry) {
      if (!Number.isFinite(nextEntry?.expiresAt)) return;
      const wait = Math.max(1000, nextEntry.expiresAt - Date.now() - SIGNED_MEDIA_REFRESH_MARGIN_MS + 1000);
      timer = window.setTimeout(load, wait);
    }

    function load() {
      const cached = readSignedMessageMedia(mediaUrl);
      if (cached) {
        setEntry(cached);
        schedule(cached);
        return;
      }
      setEntry(null);
      if (!mediaUrl) return;
      getSignedMessageMedia(mediaUrl)
        .then((next) => {
          if (!active) return;
          setEntry(next);
          schedule(next);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }

    load();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mediaUrl]);

  return { url: entry?.url || "", failed, loading: Boolean(mediaUrl) && !entry?.url && !failed };
}
