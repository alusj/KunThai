import { useEffect, useRef, useState } from "react";
import {
  HiOutlineEllipsisHorizontal,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineNoSymbol,
  HiOutlinePaperAirplane,
  HiOutlinePhoto,
  HiOutlineShieldCheck,
  HiOutlineSignal,
  HiOutlineXMark,
  HiStop,
} from "react-icons/hi2";

import { readExploreSettings } from "../../../../Backend/services/explore/preferencesService";
import { optimizeImageFile } from "../../../../Backend/services/marketplace/imageOptimization";
import { resizedImageUrl } from "../../../../Backend/lib/imageProxy";
import { useI18n } from "../../../../i18n";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi } from "../../../../i18n/index.js";
import { inlineErrorMessage } from "../../../../Backend/services/friendlyErrorService";
import { LiveRecordingStrip } from "../../../shared/recording/LiveRecording";
import { useVoiceRecorder } from "../../../shared/voice/useVoiceRecorder";
import { VoiceNoteDraft } from "../../../shared/voice/VoiceNotePlayer";
import LiveShareDurationSheet from "../../../shared/liveLocation/LiveShareDurationSheet";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.readAsDataURL(file);
  });
}

export default function MessageComposer({ focused = false, onAction, onActivity, onInputBlur, onInputFocus, onInputPointerDown, onSend }) {
  const { t } = useI18n();
  const messageSettings = readExploreSettings().messages;
  const showTypingStatus = messageSettings.showTypingStatus !== false;
  const allowVoiceNotes = messageSettings.allowVoiceNotes !== false;
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [liveSheetOpen, setLiveSheetOpen] = useState(false);
  const fileInputRef = useRef(null);
  const voice = useVoiceRecorder({
    module: "messages",
    onActivity,
    onRecorded: ({ dataUrl, seconds }) => {
      setAttachment({ type: "audio", mediaUrl: dataUrl, seconds });
      setNotice("");
    },
    onError: (message) => setNotice(message),
  });
  const recording = voice.recording;

  // Keep the "recording…" status fresh for the other person while recording.
  useEffect(() => {
    if (recording && allowVoiceNotes) onActivity?.("recording");
  }, [allowVoiceNotes, onActivity, recording, voice.seconds]);

  useEffect(() => {
    if (!actionsOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setActionsOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionsOpen]);

  async function submit(event) {
    event.preventDefault();
    const body = value.trim();
    if ((!body && !attachment) || sending) return;

    setSending(true);
    setNotice("");

    try {
      const result = await onSend?.(attachment
        ? {
          body,
          type: attachment.type,
          mediaUrl: attachment.mediaUrl,
          ...(attachment.type === "audio" ? { metadata: { durationSeconds: attachment.seconds || 0 } } : {}),
        }
        : body);
      setSending(false);

      if (result?.ok === false) {
        setNotice(result.error || i18nText("ui.literals.k18783806e157"));
        return;
      }

      onActivity?.("active");
      setValue("");
      setAttachment(null);
    } catch {
      setSending(false);
      setNotice(i18nText("ui.literals.k18783806e157"));
    }
  }

  function updateValue(nextValue) {
    setValue(nextValue);
    onActivity?.(showTypingStatus && nextValue.trim() ? "typing" : "active");
  }

  function clearAttachment() {
    setAttachment(null);
    setNotice("");
  }

  async function handleImageSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setNotice(i18nText("ui.literals.k464676a1f42d"));
      return;
    }

    try {
      // Downscale + re-encode before attaching so the photo uploads quickly
      // even on a slow connection.
      const mediaUrl = await readFileAsDataUrl(await optimizeImageFile(file));
      setAttachment({ type: "image", mediaUrl, label: file.name || "Selected photo" });
      setNotice("");
      onActivity?.("active");
    } catch (error) {
      setNotice(inlineErrorMessage(error, i18nText("ui.literals.kf4d43d3e6dbf")));
    }
  }

  function toggleRecording() {
    if (!allowVoiceNotes) return;
    if (!recording) {
      setAttachment(null);
      setNotice("");
    }
    voice.toggle();
  }

  async function runAction(action, payload) {
    setActionsOpen(false);
    setNotice("");
    try {
      const result = await onAction?.(action, payload);
      if (result?.ok === false) {
        setNotice(result.error || i18nText("ui.literals.k18f909a27edd"));
      }
    } catch (error) {
      setNotice(inlineErrorMessage(error, i18nText("ui.literals.k18f909a27edd")));
    }
  }

  const canSend = Boolean(value.trim() || attachment) && !sending && !recording;

  return (
    <form
      onSubmit={submit}
      className="kt-message-composer border-t border-slate-200 bg-white px-3 pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.05)]"
      data-focused={focused ? "true" : "false"}
    >
      {attachment?.type === "audio" ? (
        <VoiceNoteDraft
          className="mb-2"
          dataUrl={attachment.mediaUrl}
          seconds={attachment.seconds}
          onRemove={clearAttachment}
          removeLabel={t("messages.removeAttachment")}
        />
      ) : attachment ? (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
          {attachment.type === "image" ? (
            <img src={resizedImageUrl(attachment.mediaUrl, { width: 96, quality: 70 })} alt={t("messages.selectedAttachment")} className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <HiOutlineMicrophone />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-950">{attachment.type === "image" ? t("messages.photoReady") : attachment.label}</p>
            <p className="text-xs font-bold text-slate-500">{t("messages.tapSend")}</p>
          </div>
          <button type="button" onClick={clearAttachment} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500" aria-label={t("messages.removeAttachment")}>
            <HiOutlineXMark />
          </button>
        </div>
      ) : null}

      {notice ? <p className="mb-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{translateUi(notice)}</p> : null}

      {actionsOpen ? (
        <div className="absolute bottom-[4.35rem] right-3 z-20 w-64 overflow-hidden rounded-[24px] border border-slate-200 bg-white p-2 text-sm font-black text-slate-700 shadow-2xl">
          <button
            type="button"
            onClick={() => runAction("shareLocation")}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-sky-50 hover:text-sky-700"
          >
            <HiOutlineMapPin className="text-lg" />
            {t("messages.shareLocation")}
          </button>
          <button
            type="button"
            onClick={() => {
              setActionsOpen(false);
              setLiveSheetOpen(true);
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-emerald-50 hover:text-emerald-700"
          >
            <HiOutlineSignal className="text-lg" />
            {t("liveSharing.shareLive")}
          </button>
          <button
            type="button"
            onClick={() => runAction("requestLocation")}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-emerald-50 hover:text-emerald-700"
          >
            <HiOutlineShieldCheck className="text-lg" />
            {t("messages.requestLocation")}
          </button>
          <button
            type="button"
            onClick={() => runAction("blockUser")}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-rose-700 hover:bg-rose-50"
          >
            <HiOutlineNoSymbol className="text-lg" />
            {t("messages.blockUser")}
          </button>
        </div>
      ) : null}

      <div className="kt-message-composer-row flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-500"
        aria-label={t("messages.chooseImage")}
      >
        <HiOutlinePhoto />
      </button>
      {recording ? (
        <LiveRecordingStrip
          stream={voice.stream}
          seconds={voice.seconds}
          label={t("voiceNotes.recording")}
          onCancel={() => voice.discard()}
          cancelLabel={t("messages.removeAttachment")}
        />
      ) : (
      <input
        value={value}
        onChange={(event) => updateValue(event.target.value)}
        onPointerDown={onInputPointerDown}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        placeholder={t("messages.writeMessage")}
        enterKeyHint="send"
        autoComplete="off"
        className="h-11 min-w-0 flex-1 rounded-2xl border border-transparent bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
      />
      )}
      {allowVoiceNotes ? (
        <button
          type="button"
          onClick={toggleRecording}
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-lg ${recording ? "kt-rec-button" : "bg-slate-100 text-slate-500"}`}
          aria-label={recording ? t("messages.stopRecording") : t("messages.recordVoice")}
        >
          {recording ? <HiStop /> : <HiOutlineMicrophone />}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setActionsOpen((current) => !current)}
        className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${
          actionsOpen ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"
        }`}
        aria-label={t("messages.openActions")}
        aria-expanded={actionsOpen}
      >
        <HiOutlineEllipsisHorizontal />
      </button>
      <button
        type="submit"
        disabled={!canSend}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white disabled:bg-slate-200 disabled:text-slate-400"
        aria-label={t("messages.sendMessage")}
      >
        <HiOutlinePaperAirplane />
      </button>
      </div>
      <LiveShareDurationSheet
        open={liveSheetOpen}
        onClose={() => setLiveSheetOpen(false)}
        body={t("liveSharing.messageDurationBody")}
        onStart={async (minutes) => {
          const result = await onAction?.("shareLiveLocation", { minutes });
          if (result?.ok === false) throw new Error(result.error || t("liveSharing.startFailed"));
        }}
      />
    </form>
  );
}
