import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineCamera,
  HiOutlineLightBulb,
  HiOutlineMicrophone,
  HiOutlinePaperAirplane,
  HiOutlineStopCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

import { createUserCareFeedback, validateUserCareAttachment } from "../../Backend/services/explore/userCareService";
import { t as i18nText } from "../../i18n/index";

const FEEDBACK_TYPES = [
  ["idea", "Idea"],
  ["bug", "Bug"],
  ["complaint", "Complaint"],
  ["safety", "Safety"],
  ["other", "Other"],
];
const CATEGORIES = ["explore", "urfeed", "swip", "marketplace", "transport", "payments", "account", "other"];

function formatLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Floating Your Voice card: the complete Your Voice form (type, category,
// title, message, screenshot, and voice note) on the screen the user is
// already on — no navigation to the Explore menu.
export default function ScreenshotVoiceCard({ category, currentScreen, onClose }) {
  const [form, setForm] = useState(() => ({
    feedbackType: "bug",
    category: CATEGORIES.includes(category) ? category : "other",
    title: i18nText("ui.literals.k1013e848df99", { value0: currentScreen }),
    message: "",
  }));
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");
  const [voiceNote, setVoiceNote] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => () => {
    window.clearInterval(timerRef.current);
    recorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!screenshot) {
      setScreenshotPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(screenshot);
    setScreenshotPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  useEffect(() => {
    if (!sent) return undefined;
    const timer = window.setTimeout(() => onClose?.(), 2200);
    return () => window.clearTimeout(timer);
  }, [onClose, sent]);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openScreenshotPicker() {
    window.dispatchEvent(new CustomEvent("kuntai-suppress-screenshot-prompt", { detail: { durationMs: 15_000 } }));
    fileInputRef.current?.click();
  }

  function chooseScreenshot(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const error = validateUserCareAttachment(file, "image");
    if (error) {
      setFeedback(error);
      event.target.value = "";
      return;
    }
    setFeedback("");
    setScreenshot(file);
  }

  function stopRecording() {
    window.clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    setRecording(false);
  }

  async function startRecording() {
    setFeedback("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedback(i18nText("ui.literals.kfa226b11524b"));
      return;
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = String(recorder.mimeType || supportedType || "audio/webm").split(";")[0];
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        const file = new File(chunksRef.current, `your-voice-${Date.now()}.${extension}`, { type });
        const error = validateUserCareAttachment(file, "audio");
        if (error) setFeedback(error);
        else setVoiceNote(file);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => {
          if (seconds >= 59) {
            window.setTimeout(stopRecording, 0);
            return 60;
          }
          return seconds + 1;
        });
      }, 1000);
    } catch (error) {
      stream?.getTracks?.().forEach((track) => track.stop());
      const permissionBlocked = ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error?.name);
      const deviceMissing = ["NotFoundError", "DevicesNotFoundError"].includes(error?.name);
      setFeedback(permissionBlocked
        ? i18nText("ui.literals.k9ab192988c2c")
        : deviceMissing
          ? i18nText("ui.literals.k56bb80ad529f")
          : i18nText("ui.literals.k7b72fe78afd1"));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const title = form.title.trim();
    const message = form.message.trim();
    if (!title) {
      setFeedback(i18nText("ui.literals.kdeed2dda1aae"));
      return;
    }
    if (!message && !screenshot && !voiceNote) {
      setFeedback(i18nText("ui.literals.k5408b8bd2b69"));
      return;
    }
    if (!navigator.onLine) {
      setFeedback(i18nText("ui.literals.kc96504d16779"));
      return;
    }

    setSending(true);
    setFeedback("");
    try {
      await createUserCareFeedback({ ...form, title, message, screenshot, voiceNote, currentScreen });
      setSent(true);
    } catch (error) {
      setFeedback(error.message || i18nText("ui.literals.k5b75435c2c92"));
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1360] flex items-end justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:items-center sm:pb-0">
      <button
        type="button"
        aria-label={i18nText("ui.literals.ka4fd93cee736")}
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-slate-950/35 p-0 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={i18nText("ui.literals.ke501430b70a5")}
        className="kt-toast-expand-in relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-[26px] border border-sky-100 bg-white p-4 shadow-2xl shadow-slate-950/25"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
          aria-label={i18nText("ui.literals.k2149646cf4c1")}
        >
          <HiOutlineXMark className="text-xl" />
        </button>

        <div className="pl-12">
          <p className="flex items-center gap-1.5 text-sm font-black text-slate-950">
            <HiOutlineLightBulb className="text-base text-sky-500" />
            {i18nText("ui.literals.k8443fc46e9fd")}
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">
            {i18nText("ui.literals.k4ff928b94caa")} {currentScreen}.
          </p>
        </div>

        {sent ? (
          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
            {i18nText("ui.literals.k1698aeb3246b")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {feedback ? (
              <p role="status" className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-800">{feedback}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.kff2f042bfcce")}</span>
                <select
                  value={form.feedbackType}
                  onChange={(event) => updateForm({ feedbackType: event.target.value })}
                  className="h-11 w-full rounded-2xl bg-slate-100 px-3 text-sm font-black text-slate-800 outline-none"
                >
                  {FEEDBACK_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.ka3c686e711e4")}</span>
                <select
                  value={form.category}
                  onChange={(event) => updateForm({ category: event.target.value })}
                  className="h-11 w-full rounded-2xl bg-slate-100 px-3 text-sm font-black text-slate-800 outline-none"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>{formatLabel(item)}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.k24e12bcfc626")} {form.title.length}/120</span>
              <input
                maxLength={120}
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                placeholder={i18nText("ui.literals.kafdd67cba974")}
                className="h-11 w-full rounded-2xl bg-slate-100 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{i18nText("ui.literals.k8f32e2754f3f")} {form.message.length}/2000</span>
              <textarea
                maxLength={2000}
                value={form.message}
                onChange={(event) => updateForm({ message: event.target.value })}
                rows={3}
                autoFocus
                placeholder={i18nText("ui.literals.k95c77483a8ce")}
                className="w-full resize-none rounded-2xl bg-slate-100 px-3 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openScreenshotPicker}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center transition ${
                  screenshot ? "border-sky-300 bg-sky-50" : "border-dashed border-sky-300 bg-white hover:bg-sky-50"
                }`}
                aria-label={screenshot ? i18nText("ui.literals.kd66871ffd8e9") : i18nText("ui.literals.k5c4e7b7a7b55")}
              >
                {screenshotPreview ? (
                  <img src={screenshotPreview} alt="Attached screenshot" className="h-10 w-14 rounded-lg object-cover" />
                ) : (
                  <HiOutlineCamera className="text-xl text-sky-600" />
                )}
                <span className="w-full truncate text-[11px] font-black text-slate-800">
                  {screenshot ? screenshot.name : i18nText("ui.literals.k5c4e7b7a7b55")}
                </span>
                {!screenshot ? <span className="text-[10px] font-bold text-slate-400">{i18nText("ui.literals.k7bf6a130fb8c")}</span> : null}
              </button>

              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center transition ${
                  recording
                    ? "border-rose-300 bg-rose-50"
                    : voiceNote
                      ? "border-sky-300 bg-sky-50"
                      : "border-dashed border-sky-300 bg-white hover:bg-sky-50"
                }`}
                aria-label={recording ? i18nText("ui.literals.kee0d9dc8eb5e") : voiceNote ? i18nText("ui.literals.k93557e23abf9") : i18nText("ui.literals.kbab099dc9744")}
              >
                {recording ? (
                  <HiOutlineStopCircle className="text-xl text-rose-600" />
                ) : (
                  <HiOutlineMicrophone className="text-xl text-sky-600" />
                )}
                <span className="w-full truncate text-[11px] font-black text-slate-800">
                  {recording ? i18nText("ui.literals.kd47cdb226f44", { value0: recordingSeconds }) : voiceNote ? voiceNote.name : i18nText("ui.literals.kbab099dc9744")}
                </span>
                {!recording && !voiceNote ? <span className="text-[10px] font-bold text-slate-400">{i18nText("ui.literals.kacf861325c42")}</span> : null}
              </button>
            </div>

            {screenshot || voiceNote ? (
              <div className="flex flex-wrap gap-2">
                {screenshot ? (
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshot(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-[11px] font-black text-rose-600"
                  >
                    {i18nText("ui.literals.k05315c08fe33")}
                  </button>
                ) : null}
                {voiceNote ? (
                  <button type="button" onClick={() => setVoiceNote(null)} className="text-[11px] font-black text-rose-600">
                    {i18nText("ui.literals.ke0a0a04362a8")}
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">{i18nText("ui.literals.k3676bb0b4170")} {currentScreen}</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={chooseScreenshot}
              className="hidden"
            />

            <button
              type="submit"
              disabled={sending || recording}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-50"
            >
              <HiOutlinePaperAirplane className="text-base" />
              {sending ? i18nText("ui.literals.kd3c78a10f7c4") : i18nText("ui.literals.k5b341f5ba850")}
            </button>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
