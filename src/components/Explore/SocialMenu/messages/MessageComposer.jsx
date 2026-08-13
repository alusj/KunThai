import { useEffect, useRef, useState } from "react";
import {
  HiOutlineEllipsisHorizontal,
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineNoSymbol,
  HiOutlinePaperAirplane,
  HiOutlinePhoto,
  HiOutlineShieldCheck,
  HiOutlineXMark,
} from "react-icons/hi2";

import { readExploreSettings } from "../../../../Backend/services/explore/preferencesService";
import { useI18n } from "../../../../i18n";
import { t as i18nText } from "../../../../i18n/index";

function formatRecordingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.readAsDataURL(file);
  });
}

export default function MessageComposer({ onAction, onActivity, onSend }) {
  const { t } = useI18n();
  const messageSettings = readExploreSettings().messages;
  const showTypingStatus = messageSettings.showTypingStatus !== false;
  const allowVoiceNotes = messageSettings.allowVoiceNotes !== false;
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [attachment, setAttachment] = useState(null);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingSecondsRef = useRef(0);

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    if (allowVoiceNotes) onActivity?.("recording");
    const interval = window.setInterval(() => {
      setRecordingSeconds((current) => {
        const next = current + 1;
        recordingSecondsRef.current = next;
        return next;
      });
      if (allowVoiceNotes) onActivity?.("recording");
    }, 1000);

    return () => window.clearInterval(interval);
  }, [allowVoiceNotes, onActivity, recording]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop();
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

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
      const result = await onSend?.(attachment ? { body, type: attachment.type, mediaUrl: attachment.mediaUrl } : body);
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
      const mediaUrl = await readFileAsDataUrl(file);
      setAttachment({ type: "image", mediaUrl, label: file.name || "Selected photo" });
      setNotice("");
      onActivity?.("active");
    } catch (error) {
      setNotice(error.message || i18nText("ui.literals.kf4d43d3e6dbf"));
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    }
  }

  async function startRecording() {
    if (!allowVoiceNotes) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice(i18nText("ui.literals.k703ac149a63c"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        onActivity?.("active");

        if (!blob.size) {
          setNotice(i18nText("ui.literals.k3b51ce823349"));
          return;
        }

        try {
          const mediaUrl = await readFileAsDataUrl(blob);
          setAttachment({ type: "audio", mediaUrl, label: i18nText("ui.literals.kccf1da9ab56b", { value0: formatRecordingTime(recordingSecondsRef.current) }) });
          setNotice("");
        } catch {
          setNotice(i18nText("ui.literals.kf58cd926600e"));
        }
      });

      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;
      setAttachment(null);
      setNotice("");
      setRecording(true);
      onActivity?.("recording");
      recorder.start();
    } catch {
      setNotice(i18nText("ui.literals.k616aa6d808cc"));
      onActivity?.("active");
    }
  }

  function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }

    startRecording();
  }

  async function runAction(action) {
    setActionsOpen(false);
    setNotice("");
    try {
      const result = await onAction?.(action);
      if (result?.ok === false) {
        setNotice(result.error || i18nText("ui.literals.k18f909a27edd"));
      }
    } catch (error) {
      setNotice(error?.message || i18nText("ui.literals.k18f909a27edd"));
    }
  }

  const canSend = Boolean(value.trim() || attachment) && !sending && !recording;

  return (
    <form onSubmit={submit} className="relative border-t border-slate-200 bg-white p-3">
      {recording ? (
        <div className="mb-2 flex items-center justify-between rounded-2xl bg-rose-50 px-3 py-2 text-sm font-black text-rose-700">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
            {i18nText("ui.literals.k409a42143265")}
          </span>
          <span>{formatRecordingTime(recordingSeconds)}</span>
        </div>
      ) : null}

      {attachment ? (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
          {attachment.type === "image" ? (
            <img src={attachment.mediaUrl} alt={t("messages.selectedAttachment")} className="h-12 w-12 rounded-xl object-cover" />
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

      {notice ? <p className="mb-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{notice}</p> : null}

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

      <div className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-500"
        aria-label={t("messages.chooseImage")}
      >
        <HiOutlinePhoto />
      </button>
      <input
        value={value}
        onChange={(event) => updateValue(event.target.value)}
        placeholder={t("messages.writeMessage")}
        className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none"
      />
      {allowVoiceNotes ? (
        <button
          type="button"
          onClick={toggleRecording}
          className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${recording ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}
          aria-label={recording ? t("messages.stopRecording") : t("messages.recordVoice")}
        >
          <HiOutlineMicrophone />
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
    </form>
  );
}
