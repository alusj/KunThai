import { useEffect, useRef, useState } from "react";
import {
  HiOutlineBugAnt,
  HiOutlineCamera,
  HiOutlineCheckCircle,
  HiOutlineLightBulb,
  HiOutlineMicrophone,
  HiOutlinePaperAirplane,
  HiOutlineShieldCheck,
  HiOutlineStopCircle,
  HiOutlineXMark,
} from "react-icons/hi2";

import {
  createUserCareFeedback,
  fetchUserCareFeedback,
  validateUserCareAttachment,
} from "../../../../Backend/services/explore/userCareService";
import { showToast } from "../../../../Backend/services/toastService";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import { t as i18nText, uiText } from "../../../../i18n/index";

const FEEDBACK_TYPES = [
  ["idea", "Idea"],
  ["bug", "Bug"],
  ["complaint", "Complaint"],
  ["safety", "Safety"],
  ["other", "Other"],
];
const FEEDBACK_TYPE_LABELS = Object.fromEntries(FEEDBACK_TYPES);
const CATEGORIES = [
  ["explore", "Explore"], ["urfeed", "UrFeed"], ["swip", "Swip"],
  ["marketplace", "Marketplace"], ["transport", "Transport"],
  ["payments", "Payments"], ["account", "Account"], ["other", "Other"],
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  planned: "Planned",
  fixed: "Fixed",
  closed: "Closed",
};

function emptyForm() {
  return { feedbackType: "idea", category: "explore", title: "", message: "" };
}

function formatLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function YourVoiceScreen({ hideHeader = false, initialDraft = null }) {
  const [form, setForm] = useState(emptyForm);
  const [currentScreen, setCurrentScreen] = useState("Explore / Your Voice");
  const [screenshot, setScreenshot] = useState(null);
  const [voiceNote, setVoiceNote] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const screenshotInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!initialDraft) return;
    setForm((current) => ({
      ...current,
      feedbackType: initialDraft.feedbackType || current.feedbackType,
      category: initialDraft.category || current.category,
      title: initialDraft.title || current.title,
      message: initialDraft.message || current.message,
    }));
    setCurrentScreen(initialDraft.currentScreen || "Explore / Your Voice");
    if (initialDraft.requestScreenshot) {
      setFeedback(i18nText("ui.literals.k2b963575353c"));
    }
  }, [initialDraft]);

  useEffect(() => {
    let active = true;
    fetchUserCareFeedback()
      .then((items) => {
        if (active) setFeedbackItems(items);
      })
      .catch((error) => {
        if (active) setFeedback(error.message || i18nText("ui.literals.k6e21b7bb0d6e"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    window.clearInterval(timerRef.current);
    recorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
  }, []);

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

  function chooseScreenshot(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    const error = validateUserCareAttachment(file, "image");
    if (error) {
      setFeedback(error);
      event.target.value = "";
      return;
    }
    setScreenshot(file);
    setFeedback("");
  }

  function removeScreenshot() {
    setScreenshot(null);
    if (screenshotInputRef.current) screenshotInputRef.current.value = "";
  }

  function openScreenshotPicker() {
    window.dispatchEvent(new CustomEvent("kuntai-suppress-screenshot-prompt", {
      detail: { durationMs: 3_500 },
    }));
    screenshotInputRef.current?.click();
  }

  function reportThisScreen() {
    setForm((current) => ({
      ...current,
      feedbackType: "bug",
      category: "explore",
      title: current.title || uiText("Feedback about Your Voice"),
    }));
    setCurrentScreen("Explore / Your Voice");
    setFeedback(i18nText("ui.literals.k2b730c1f9aec"));
  }

  async function submit(event) {
    event.preventDefault();
    setFeedback("");
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

    setSubmitting(true);
    try {
      const created = await createUserCareFeedback({ ...form, title, message, screenshot, voiceNote, currentScreen });
      setFeedbackItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setForm(emptyForm());
      setScreenshot(null);
      setVoiceNote(null);
      setCurrentScreen("Explore / Your Voice");
      if (screenshotInputRef.current) screenshotInputRef.current.value = "";
      setFeedback(i18nText("ui.literals.ke9c05bfc7aef"));
      showToast(i18nText("ui.literals.ke9c05bfc7aef"), "success");
    } catch (error) {
      setFeedback(error.message || i18nText("ui.literals.kefa4fc61bfff"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.k43c1a80ada8e")} subtitle={i18nText("ui.literals.k619fe0c8984e")} /> : null}
      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-700 text-white"><HiOutlineLightBulb className="text-2xl" /></span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18nText("ui.literals.kac4a432ca44b")}</p>
              <h3 className="mt-1 text-2xl font-black text-slate-950">{i18nText("ui.literals.k6af866358f73")}</h3>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{i18nText("ui.literals.k6358eb2d66b0")}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={openScreenshotPicker} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white text-sm font-black text-sky-700"><HiOutlineCamera className="text-xl" /> {i18nText("ui.literals.k5c4e7b7a7b55")}</button>
            <button type="button" onClick={reportThisScreen} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white"><HiOutlineBugAnt className="text-xl" /> {i18nText("ui.literals.k95a4c817f5a7")}</button>
          </div>
        </section>

        <form onSubmit={submit} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={i18nText("ui.literals.kff2f042bfcce")}>
              <select value={form.feedbackType} onChange={(event) => setForm((current) => ({ ...current, feedbackType: event.target.value }))} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none">
                {FEEDBACK_TYPES.map(([value, label]) => <option key={value} value={value}>{uiText(label)}</option>)}
              </select>
            </Field>
            <Field label={i18nText("ui.literals.ka3c686e711e4")}>
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none">
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{uiText(label)}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label={i18nText("ui.literals.k8a7ef4aaf0a9", { value0: form.title.length })}>
              <input maxLength={120} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={i18nText("ui.literals.kafdd67cba974")} className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200" />
            </Field>
            <Field label={i18nText("ui.literals.k62a7f45e1f64", { value0: form.message.length })}>
              <textarea maxLength={2000} rows={6} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder={i18nText("ui.literals.kc4999bb1c9a5")} className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200" />
            </Field>
          </div>

          <input ref={screenshotInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseScreenshot} className="hidden" />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <AttachmentCard icon={HiOutlineCamera} title={i18nText("ui.literals.k60c152d92dff")} detail={screenshot?.name || i18nText("ui.literals.kf787c2e6bf2e")} active={Boolean(screenshot)} onAdd={openScreenshotPicker} onRemove={removeScreenshot} />
            <AttachmentCard icon={recording ? HiOutlineStopCircle : HiOutlineMicrophone} title={i18nText("ui.literals.kddc07a6c1316")} detail={recording ? i18nText("ui.literals.kd47cdb226f44", { value0: recordingSeconds }) : voiceNote?.name || i18nText("ui.literals.k55675501b93e")} active={Boolean(voiceNote || recording)} onAdd={recording ? stopRecording : startRecording} onRemove={() => setVoiceNote(null)} actionLabel={recording ? i18nText("ui.literals.k9e253470c876") : voiceNote ? i18nText("ui.literals.ka7cf7b25a703") : i18nText("ui.literals.k1c54132b8e5a")} />
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold leading-5 text-slate-500">{i18nText("ui.literals.k3676bb0b4170")} {uiText(currentScreen)}</div>
          {feedback ? <p role="status" className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-black leading-6 text-sky-800">{feedback}</p> : null}
          <button type="submit" disabled={submitting || recording} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-50"><HiOutlinePaperAirplane className="text-lg" /> {submitting ? i18nText("ui.literals.kd3c78a10f7c4") : i18nText("ui.literals.k5b341f5ba850")}</button>
        </form>

        <section>
          <div className="mb-3 px-1"><p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18nText("ui.literals.k7701f8a719df")}</p><p className="mt-1 text-sm font-semibold text-slate-500">{i18nText("ui.literals.k11068b274d9f")}</p></div>
          {loading ? <p className="rounded-[24px] bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">{i18nText("ui.literals.k394eeed4c8d4")}</p> : !feedbackItems.length ? <p className="rounded-[24px] border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500">{i18nText("ui.literals.kd1880e94a757")}</p> : (
            <div className="grid gap-3 lg:grid-cols-2">{feedbackItems.map((item) => <FeedbackCard key={item.id} item={item} />)}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ children, label }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>{children}</label>;
}

function AttachmentCard({ active, actionLabel = "Attach", detail, icon: Icon, onAdd, onRemove, title }) {
  return (
    <div className={`rounded-[22px] border p-4 ${active ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-white text-sky-700 shadow-sm"><Icon className="text-xl" /></span><div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-950">{title}</p><p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500">{detail}</p></div></div>
      <div className="mt-3 flex gap-2"><button type="button" onClick={onAdd} className="h-10 flex-1 rounded-xl bg-slate-950 px-3 text-xs font-black text-white">{actionLabel}</button>{active && onRemove ? <button type="button" onClick={onRemove} className="grid h-10 w-10 place-items-center rounded-xl bg-white text-rose-600" aria-label={i18nText("ui.literals.ka2d40d3386fc", { value0: title })}><HiOutlineXMark /></button> : null}</div>
    </div>
  );
}

function FeedbackCard({ item }) {
  const safety = item.feedbackType === "safety";
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.14em] text-sky-700">{uiText(FEEDBACK_TYPE_LABELS[item.feedbackType] || formatLabel(item.feedbackType))} · {uiText(CATEGORY_LABELS[item.category] || formatLabel(item.category))}</p><h4 className="mt-1 truncate text-base font-black text-slate-950">{item.title}</h4></div><span className={`flex-none rounded-full px-3 py-1 text-xs font-black ${safety ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-700"}`}>{uiText(STATUS_LABELS[item.status] || formatLabel(item.status))}</span></div>
      <p className="mt-3 text-xs font-bold text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
      {item.adminReply ? <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-700"><HiOutlineCheckCircle className="text-lg" /> {i18nText("ui.literals.kc8de2f957b49")}</div><p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">{item.adminReply}</p></div> : null}
      {item.feedbackType === "safety" ? <div className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800"><HiOutlineShieldCheck className="mt-0.5 flex-none text-lg" /> {i18nText("ui.literals.k0ca51cd1963d")}</div> : null}
    </article>
  );
}
