import { useState } from "react";
import {
  HiOutlineClipboardDocument,
  HiOutlineMapPin,
  HiOutlineNoSymbol,
  HiOutlineShieldCheck,
  HiOutlineTrash,
} from "react-icons/hi2";

export default function MessageBubble({
  mine,
  message,
  onApproveLocationRequest,
  onBlockUser,
  onDeleteMessage,
  onOpenSharedLocation,
  otherUserName = "This user",
  seen = false,
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const mediaUrl = message.mediaUrl || message.media_url || "";
  const mediaType = message.type || message.media_type || "text";
  const metadata = message.metadata || {};
  const bodyLocationMatch = String(message.body || "").match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  const hasSharedMapPoint = (
    Number.isFinite(Number(metadata.lat ?? metadata.latitude)) &&
    Number.isFinite(Number(metadata.lng ?? metadata.longitude))
  ) || Boolean(bodyLocationMatch);
  const bubbleClass = `kuntai-break max-w-[82%] rounded-[22px] px-4 py-3 text-sm font-semibold leading-6 sm:max-w-[78%] ${
    mine ? "rounded-br-md bg-slate-950 text-white" : "rounded-bl-md bg-slate-100 text-slate-800"
  }`;
  const timeOnly = message.pending ? "Sending..." : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const timeLabel = seen && !message.pending ? `${timeOnly} · Seen` : timeOnly;

  function stop(event) {
    event.stopPropagation();
  }

  async function copyMessage(event) {
    stop(event);
    const text = message.body || mediaUrl || (mediaType === "location_share" ? "Shared location" : "Message");
    try {
      await navigator.clipboard?.writeText?.(text);
    } catch {
      // Clipboard permission is optional; the action tray should still close.
    }
    setOptionsOpen(false);
  }

  function runMessageAction(event, action) {
    stop(event);
    setOptionsOpen(false);
    action?.(message);
  }

  function renderOptions() {
    if (!optionsOpen) return null;

    return (
      <div
        className={`kt-message-options-pop absolute top-[calc(100%+0.45rem)] z-20 min-w-44 overflow-hidden rounded-2xl border border-white/70 bg-white p-1 text-slate-900 shadow-2xl ring-1 ring-slate-950/5 ${
          mine ? "right-0" : "left-0"
        }`}
        onClick={stop}
      >
        {hasSharedMapPoint ? (
          <MessageAction icon={HiOutlineMapPin} label="Open in Area View" onClick={(event) => runMessageAction(event, onOpenSharedLocation)} />
        ) : null}
        <MessageAction icon={HiOutlineClipboardDocument} label="Copy message" onClick={copyMessage} />
        <MessageAction
          danger
          icon={HiOutlineTrash}
          label={mine ? "Delete message" : "Hide message"}
          onClick={(event) => runMessageAction(event, onDeleteMessage)}
        />
        {!mine ? (
          <MessageAction danger icon={HiOutlineNoSymbol} label="Block sender" onClick={(event) => runMessageAction(event, onBlockUser)} />
        ) : null}
      </div>
    );
  }

  if (mediaType === "location_request") {
    return (
      <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`${bubbleClass} relative cursor-pointer`} onClick={() => setOptionsOpen((open) => !open)}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-2xl ${mine ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700"}`}>
              <HiOutlineMapPin />
            </span>
            <div className="min-w-0">
              <p className="font-black">{mine ? "Location request sent" : "Location requested"}</p>
              <p className={mine ? "text-white/80" : "text-slate-600"}>
                {message.body || `${otherUserName} is requesting your location.`}
              </p>
            </div>
          </div>
          {!mine ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(event) => runMessageAction(event, onApproveLocationRequest)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white"
              >
                <HiOutlineShieldCheck />
                Approve
              </button>
              <button
                type="button"
                onClick={(event) => runMessageAction(event, onBlockUser)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 text-xs font-black text-rose-700"
              >
                <HiOutlineNoSymbol />
                Block
              </button>
            </div>
          ) : null}
          <p className={`mt-1 text-[10px] font-bold ${mine ? "text-white/55" : "text-slate-400"}`}>
            {timeLabel}
          </p>
          {renderOptions()}
        </div>
      </div>
    );
  }

  if (mediaType === "location_share") {
    return (
      <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`${bubbleClass} relative cursor-pointer`} onClick={() => setOptionsOpen((open) => !open)}>
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-2xl ${mine ? "bg-white/10 text-white" : "bg-sky-50 text-sky-700"}`}>
              <HiOutlineMapPin />
            </span>
            <div className="min-w-0">
              <p className="font-black">{mine ? "Location sharing" : "Location update"}</p>
              <p className={mine ? "text-white/80" : "text-slate-600"}>{message.body || "A location is being shared from Area View."}</p>
            </div>
          </div>
          {hasSharedMapPoint ? (
            <button
              type="button"
              onClick={(event) => runMessageAction(event, onOpenSharedLocation)}
              className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-3 text-xs font-black ${
                mine ? "bg-white text-slate-950" : "bg-sky-600 text-white"
              }`}
            >
              <HiOutlineMapPin />
              Open in Area View
            </button>
          ) : null}
          <p className={`mt-1 text-[10px] font-bold ${mine ? "text-white/55" : "text-slate-400"}`}>
            {timeLabel}
          </p>
          {renderOptions()}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`${bubbleClass} relative cursor-pointer`} onClick={() => setOptionsOpen((open) => !open)}>
        {mediaType === "image" && mediaUrl ? (
          <img src={mediaUrl} alt="Message attachment" className="mb-2 max-h-72 w-full rounded-2xl object-cover" />
        ) : null}
        {mediaType === "audio" && mediaUrl ? (
          <div className={`mb-2 rounded-2xl p-2 ${mine ? "bg-white/10" : "bg-white"}`}>
            <audio controls src={mediaUrl} className="w-full" aria-label="Voice message" />
          </div>
        ) : null}
        {message.body ? <p>{message.body}</p> : mediaType === "audio" ? <p>Voice note</p> : mediaType === "image" ? <p>Photo</p> : null}
        <p className={`mt-1 text-[10px] font-bold ${mine ? "text-white/55" : "text-slate-400"}`}>
          {timeLabel}
        </p>
        {renderOptions()}
      </div>
    </div>
  );
}

function MessageAction({ danger = false, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black transition ${
        danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon className="text-base" />
      {label}
    </button>
  );
}
