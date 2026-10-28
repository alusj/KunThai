import { useEffect, useState } from "react";
import { FiRadio } from "react-icons/fi";

import { useI18n, t } from "../../../i18n";
import { stopLiveShare } from "../../services/liveLocationShareService";
import LiveLocationViewer from "./LiveLocationViewer";

function clock(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

// A "live location" message: until it ends, the other person can watch the
// sender move; the sender can watch it too or stop it. After the end time (or
// once stopped) it only says it has ended.
export default function LiveLocationMessage({ mine, shareId, expiresAt, name = "" }) {
  useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [stoppedHere, setStoppedHere] = useState(false);
  const end = new Date(expiresAt).getTime();
  const live = Number.isFinite(end) && end > now && !stoppedHere;

  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [live]);

  const title = mine ? t("liveSharing.youAreSharing") : t("liveSharing.isSharing", { name: name || t("liveSharing.someone") });

  return (
    <>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-2xl ${mine ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700"}`}>
          <FiRadio className={live ? "animate-pulse" : ""} />
        </span>
        <div className="min-w-0">
          <p className="font-black">{live ? title : t("liveSharing.ended")}</p>
          <p className={mine ? "text-white/80" : "text-slate-600"}>
            {live ? t("liveSharing.liveUntil", { time: clock(expiresAt) }) : t("liveSharing.endedBody")}
          </p>
        </div>
      </div>
      {live ? (
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className={`flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-3 text-xs font-black ${mine ? "bg-white text-slate-950" : "bg-emerald-600 text-white"}`}
          >
            {t("liveSharing.viewLive")}
          </button>
          {mine ? (
            <button
              type="button"
              onClick={() => {
                setStoppedHere(true);
                stopLiveShare(shareId);
              }}
              className="flex h-10 w-full items-center justify-center rounded-2xl border border-white/30 px-3 text-xs font-black text-white"
            >
              {t("liveSharing.stopSharing")}
            </button>
          ) : null}
        </div>
      ) : null}
      <LiveLocationViewer
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        title={mine ? t("liveSharing.yourLiveLocation") : t("liveSharing.nameLiveLocation", { name: name || t("liveSharing.someone") })}
        source={{ kind: "share", shareId }}
        isMine={mine}
        returnTo="explore-messages"
      />
    </>
  );
}
