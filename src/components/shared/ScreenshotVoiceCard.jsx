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
    title: `${currentScreen} screenshot feedback`,
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
      setFeedback("Voice recording is not available in this browser. You can still send text or a screenshot.");
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
        ? "Microphone access is blocked. Allow microphone access for KunThai in your browser settings, then tap Record again."
        : deviceMissing
          ? "No microphone was found on this device. You can still send text or a screenshot."
          : "KunThai could not start voice recording. Close other apps using the microphone, then try again.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const title = form.title.trim();
    const message = form.message.trim();
    if (!title) {
      setFeedback("Add a title for your feedback.");
      return;
    }
    if (!message && !screenshot && !voiceNote) {
      setFeedback("Add a message, screenshot, or voice note.");
      return;
    }
    if (!navigator.onLine) {
      setFeedback("You are offline. Reconnect before sending feedback.");
      return;
    }

    setSending(true);
    setFeedback("");
    try {
      await createUserCareFeedback({ ...form, title, message, screenshot, voiceNote, currentScreen });
      setSent(true);
    } catch (error) {
      setFeedback(error.message || "Unable to send this feedback right now.");
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1360] flex items-end justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:items-center sm:pb-0">
      <button
        type="button"
        aria-label="Close Your Voice card"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-slate-950/35 p-0 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback to KunThai"
        className="kt-toast-expand-in relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-[26px] border border-sky-100 bg-white p-4 shadow-2xl shadow-slate-950/25"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
          aria-label="Cancel feedback"
        >
          <HiOutlineXMark className="text-xl" />
        </button>

        <div className="pl-12">
          <p className="flex items-center gap-1.5 text-sm font-black text-slate-950">
            <HiOutlineLightBulb className="text-base text-sky-500" />
            Add to Your Voice
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">
            Share an idea, problem, screenshot, or voice note — you stay on {currentScreen}.
          </p>
        </div>

        {sent ? (
          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
            Sent to KunThai. Thank you — you can follow replies in Your Voice.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {feedback ? (
              <p role="status" className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-800">{feedback}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Feedback type</span>
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
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Category</span>
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
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Title · {form.title.length}/120</span>
              <input
                maxLength={120}
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                placeholder="What would you like KunThai to know?"
                className="h-11 w-full rounded-2xl bg-slate-100 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Message · {form.message.length}/2000</span>
              <textarea
                maxLength={2000}
                value={form.message}
                onChange={(event) => updateForm({ message: event.target.value })}
                rows={3}
                autoFocus
                placeholder="Describe the idea, problem, or complaint..."
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
                aria-label={screenshot ? "Replace screenshot" : "Attach screenshot"}
              >
                {screenshotPreview ? (
                  <img src={screenshotPreview} alt="Attached screenshot" className="h-10 w-14 rounded-lg object-cover" />
                ) : (
                  <HiOutlineCamera className="text-xl text-sky-600" />
                )}
                <span className="w-full truncate text-[11px] font-black text-slate-800">
                  {screenshot ? screenshot.name : "Attach screenshot"}
                </span>
                {!screenshot ? <span className="text-[10px] font-bold text-slate-400">PNG, JPG, WebP · max 5MB</span> : null}
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
                aria-label={recording ? "Stop recording" : voiceNote ? "Replace voice note" : "Record voice note"}
              >
                {recording ? (
                  <HiOutlineStopCircle className="text-xl text-rose-600" />
                ) : (
                  <HiOutlineMicrophone className="text-xl text-sky-600" />
                )}
                <span className="w-full truncate text-[11px] font-black text-slate-800">
                  {recording ? `Recording ${recordingSeconds}s / 60s` : voiceNote ? voiceNote.name : "Record voice note"}
                </span>
                {!recording && !voiceNote ? <span className="text-[10px] font-bold text-slate-400">Optional · max 60s</span> : null}
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
                    Remove screenshot
                  </button>
                ) : null}
                {voiceNote ? (
                  <button type="button" onClick={() => setVoiceNote(null)} className="text-[11px] font-black text-rose-600">
                    Remove voice note
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">Screen context: {currentScreen}</p>

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
              {sending ? "Sending privately..." : "Send to KunThai"}
            </button>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
