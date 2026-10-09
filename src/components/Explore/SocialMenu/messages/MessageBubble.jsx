import { useState } from "react";
import {
  HiOutlineClipboardDocument,
  HiOutlineMapPin,
  HiOutlineNoSymbol,
  HiOutlineShieldCheck,
  HiOutlineTrash,
} from "react-icons/hi2";

import { useI18n } from "../../../../i18n";
import MessageImage from "../../../shared/MessageImage";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { t as i18nText } from "../../../../i18n/index";
import { useMessageMediaUrl } from "../../../../Backend/hooks/useMessageMediaUrl";
import { locationMessageParts } from "../../../../Backend/services/explore/messageInboxModels.js";
import { showToast } from "../../../../Backend/services/toastService";
import { shortErrorToast } from "../../../../Backend/services/friendlyErrorService";

// Location messages carry a text key so they read in the viewer's language.
function locationText(message) {
  const parts = locationMessageParts(message);
  return parts ? i18nText(`exploreMessagesFix.${parts.key}`, parts.vars) : message.body || "";
}

export default function MessageBubble({
  mine,
  message,
  onApproveLocationRequest,
  onBlockUser,
  onDeleteMessage,
  onOpenSharedLocation,
  otherUserName,
  seen = false,
  // Space inbox: which teammate sent one of "our" replies ("Sent by Aminata").
  senderLabel = "",
  // A Space is not a person: its threads offer no "block sender".
  canBlock = true,
  // Only your own messages can be deleted for everyone. A teammate's reply in
  // a Space inbox is "ours" but can only be hidden for you.
  canDelete = mine,
}) {
  const { t } = useI18n();
  const otherName = otherUserName || t("messages.thisUser");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const storedMediaUrl = message.mediaUrl || message.media_url || "";
  const media = useMessageMediaUrl(storedMediaUrl);
  const mediaUrl = media.url;
  const mediaType = message.type || message.media_type || "text";
  const metadata = message.metadata || {};
  const actor = metadata.actor || {};
  const actorName = actor.actorType === "space" ? actor.actorName || "" : "";
  const bodyLocationMatch = String(message.body || "").match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  const hasSharedMapPoint = (
    Number.isFinite(Number(metadata.lat ?? metadata.latitude)) &&
    Number.isFinite(Number(metadata.lng ?? metadata.longitude))
  ) || Boolean(bodyLocationMatch);
  const bubbleClass = `kuntai-break max-w-[82%] rounded-[22px] px-4 py-3 text-sm font-semibold leading-6 sm:max-w-[78%] ${
    mine ? "rounded-br-md bg-slate-950 text-white" : "rounded-bl-md bg-slate-100 text-slate-800"
  }`;
  const timeOnly = message.pending ? t("messages.sending") : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const timeLabel = seen && !message.pending ? `${timeOnly} · ${t("messages.seen")}` : timeOnly;

  function stop(event) {
    event.stopPropagation();
  }

  async function copyMessage(event) {
    stop(event);
    const text = message.body || mediaUrl || (mediaType === "location_share" ? t("messages.sharedLocation") : t("messages.messageWord"));
    try {
      await navigator.clipboard?.writeText?.(text);
    } catch {
      // Clipboard permission is optional; the action tray should still close.
    }
    setOptionsOpen(false);
  }

  async function runMessageAction(event, action) {
    stop(event);
    setOptionsOpen(false);
    try {
      const result = await action?.(message);
      // Cancelled confirmations and actions that already explained their
      // failure stay quiet.
      if (result?.ok === false && !result.cancelled && !result.notified) {
        showToast(i18nText("exploreMessagesFix.actionFailedToast"), "danger");
      }
    } catch (error) {
      showToast(shortErrorToast(error, i18nText("exploreMessagesFix.actionFailedToast")), "danger");
    }
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
          <MessageAction icon={HiOutlineMapPin} label={t("messages.openAreaView")} onClick={(event) => runMessageAction(event, onOpenSharedLocation)} />
        ) : null}
        <MessageAction icon={HiOutlineClipboardDocument} label={t("messages.copyMessage")} onClick={copyMessage} />
        <MessageAction
          danger
          icon={HiOutlineTrash}
          label={mine && canDelete ? t("messages.deleteMessage") : i18nText("exploreMessagesFix.hideForMe")}
          onClick={(event) => runMessageAction(event, onDeleteMessage)}
        />
        {!mine && canBlock ? (
          <MessageAction danger icon={HiOutlineNoSymbol} label={t("messages.blockSender")} onClick={(event) => runMessageAction(event, onBlockUser)} />
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
              <p className="font-black">{mine ? t("messages.locationRequestSent") : t("messages.locationRequested")}</p>
              <p className={mine ? "text-white/80" : "text-slate-600"}>
                {locationText(message) || t("messages.requestingLocation", { name: otherName })}
              </p>
            </div>
          </div>
          {!mine ? (
            <div className={`mt-3 grid gap-2 ${canBlock ? "grid-cols-2" : "grid-cols-1"}`}>
              <button
                type="button"
                onClick={(event) => runMessageAction(event, onApproveLocationRequest)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white"
              >
                <HiOutlineShieldCheck />
                {t("messages.approve")}
              </button>
              {canBlock ? (
                <button
                  type="button"
                  onClick={(event) => runMessageAction(event, onBlockUser)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 text-xs font-black text-rose-700"
                >
                  <HiOutlineNoSymbol />
                  {t("messages.block")}
                </button>
              ) : null}
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
              <p className="font-black">{mine ? t("messages.locationSharing") : t("messages.locationUpdate")}</p>
              <p className={mine ? "text-white/80" : "text-slate-600"}>{locationText(message) || t("messages.locationBeingShared")}</p>
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
              {t("messages.openAreaView")}
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
          <MessageImage mediaUrl={mediaUrl} alt={t("messages.photo")} pending={message.pending} className="mb-2" />
        ) : null}
        {["image", "video"].includes(mediaType) && media.loading ? (
          <span className="mb-2 block h-36 w-full animate-pulse rounded-2xl bg-slate-200/70" aria-hidden="true" />
        ) : null}
        {media.failed ? (
          <p className={`mb-2 text-xs font-bold ${mine ? "text-white/60" : "text-slate-400"}`}>{i18nText("exploreMessagesFix.mediaUnavailable")}</p>
        ) : null}
        {mediaType === "video" && mediaUrl ? (
          <video controls playsInline preload="metadata" src={mediaUrl} className="mb-2 max-h-72 w-full rounded-2xl bg-black" onClick={stop} />
        ) : null}
        {!mine && actorName ? (
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700">{actorName}</p>
        ) : null}
        {mine && senderLabel ? (
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{senderLabel}</p>
        ) : null}
        {mediaType === "audio" && mediaUrl ? (
          <div className={`mb-2 rounded-2xl p-2 ${mine ? "bg-white/10" : "bg-white"}`}>
            <audio controls src={mediaUrl} className="w-full" aria-label={t("messages.voiceMessage")} />
          </div>
        ) : null}
        {message.body ? <p>{message.body}</p> : mediaType === "audio" ? <p>{t("messages.voiceNote")}</p> : mediaType === "image" ? <p>{t("messages.photo")}</p> : mediaType === "video" ? <p>{i18nText("exploreMessagesFix.previewVideo")}</p> : null}
        <p className={`mt-1 text-[10px] font-bold ${mine ? "text-white/55" : "text-slate-400"}`}>
          {timeLabel}
        </p>
        {renderOptions()}
      </div>
    </div>
  );
}

function MessageAction({ danger = false, icon: Icon, label, onClick }) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black transition ${
        danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon className="text-base" />
      {translateUi(label)}
    </button>
  );
}
