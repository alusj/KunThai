import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Save, Sparkles, X } from "lucide-react";

import {
  CAMPAIGN_STEPS,
  buildCampaignPayload,
  validateCampaignStep,
} from "../notificationCampaignConfig";
import { ActionStep, AudienceStep, CampaignStep, ContentStep, PresentationStep, ScheduleStep } from "./CampaignBuilderSteps";
import CampaignPreviewStep from "./CampaignPreviewStep";
import CampaignReviewStep from "./CampaignReviewStep";

const DESCRIPTIONS = {
  campaign: "Name the campaign for administrators and set its type and priority.",
  audience: "Choose exactly who receives it, using real KunThai account data.",
  presentation: "Choose where and how it appears. Only options this audience can see are offered.",
  content: "Write what people will read.",
  action: "Decide what happens when people tap it.",
  schedule: "Send when published or at a set time, and choose when it ends.",
  preview: "Check the look and animation, then send a real test to a KunThai account.",
  review: "Check everything, confirm the audience and send or schedule.",
};

export default function CampaignBuilder({ initialForm, campaignId: initialCampaignId = "", permissions, onClose, onSave, onEstimate, onSubmit }) {
  const [form, setFormState] = useState(initialForm);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const mainRef = useRef(null);
  const dialogRef = useRef(null);
  const options = { canCritical: permissions.canCritical };
  const stepId = CAMPAIGN_STEPS[step].id;

  function setForm(updater) {
    setFormState((current) => (typeof updater === "function" ? updater(current) : updater));
    setDirty(true);
    setSavedMessage("");
    setEstimate(null);
  }

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    mainRef.current?.querySelector("h3")?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !busy && !document.querySelector("[aria-modal='true'][data-campaign-nested]")) requestClose();
    }
    const dialog = dialogRef.current;
    dialog?.addEventListener("keydown", onKeyDown);
    return () => dialog?.removeEventListener("keydown", onKeyDown);
  });

  function requestClose() {
    if (dirty && !window.confirm("Close the campaign builder? Unsaved changes will be lost.")) return;
    onClose();
  }

  function goTo(index) {
    // Moving forward requires every earlier step to be valid.
    for (let position = 0; position < index; position += 1) {
      const message = validateCampaignStep(CAMPAIGN_STEPS[position].id, form, options);
      if (message) {
        setStep(position);
        setError(message);
        return;
      }
    }
    setError("");
    setStep(index);
  }

  async function save() {
    if (!form.campaign.name.trim() || !form.content.title.trim() || !form.content.body.trim() || !form.audience.platform) {
      setError("A draft needs a campaign name, an audience, a title and a message.");
      return "";
    }
    setBusy(true);
    setError("");
    try {
      const saved = await onSave(form, campaignId);
      setCampaignId(saved.id);
      setDirty(false);
      setSavedMessage("Draft saved");
      return saved.id;
    } catch (nextError) {
      setError(nextError.message || "The campaign could not be saved.");
      return "";
    } finally {
      setBusy(false);
    }
  }

  async function ensureSaved() {
    if (campaignId && !dirty) return campaignId;
    return save();
  }

  async function estimateNow() {
    setEstimating(true);
    setError("");
    try {
      setEstimate(await onEstimate(buildCampaignPayload(form)));
    } catch (nextError) {
      setError(nextError.message || "The audience could not be calculated.");
    } finally {
      setEstimating(false);
    }
  }

  async function submit(options) {
    setBusy(true);
    setError("");
    try {
      await onSubmit(form, campaignId, options);
    } catch (nextError) {
      setError(nextError.message || "The campaign could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const stepProps = { form, setForm, canCritical: permissions.canCritical };

  return (
    <div className="fixed inset-0 z-[1500] flex bg-zinc-950/65 sm:p-4" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="campaign-builder-title" className="relative mx-auto flex h-[100dvh] w-full max-w-7xl flex-col overflow-hidden bg-zinc-50 shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-[28px] dark:bg-zinc-950">
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-3 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 sm:grid dark:bg-emerald-950"><Sparkles size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">{campaignId ? "Edit campaign" : "New campaign"}{savedMessage ? ` · ${savedMessage}` : dirty ? " · Unsaved changes" : ""}</p>
            <h2 id="campaign-builder-title" className="truncate text-base font-black sm:text-lg">{form.campaign.name || "Untitled campaign"}</h2>
          </div>
          <button type="button" onClick={save} disabled={busy} className="campaign-action hidden sm:inline-flex">
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} Save draft
          </button>
          <button type="button" onClick={requestClose} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800" aria-label="Close campaign builder"><X size={20} /></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Phones and tablets: progress + step picker. Desktop: step list. */}
          <div className="border-b border-zinc-200 bg-white px-3 py-2 lg:hidden dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <label htmlFor="campaign-step-picker" className="sr-only">Campaign step</label>
              <select id="campaign-step-picker" value={step} onChange={(event) => goTo(Number(event.target.value))} className="campaign-input min-h-10 min-w-0 flex-1 text-sm">
                {CAMPAIGN_STEPS.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.label}</option>)}
              </select>
              <span className="shrink-0 text-xs font-black text-zinc-500">{step + 1}/{CAMPAIGN_STEPS.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuemin={1} aria-valuemax={CAMPAIGN_STEPS.length} aria-valuenow={step + 1} aria-label="Campaign progress">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${((step + 1) / CAMPAIGN_STEPS.length) * 100}%` }} />
            </div>
          </div>
          <nav aria-label="Campaign steps" className="hidden w-64 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-4 lg:block dark:border-zinc-800 dark:bg-zinc-950">
            <ol className="space-y-1">
              {CAMPAIGN_STEPS.map((item, index) => (
                <li key={item.id}>
                  <button type="button" onClick={() => goTo(index)} aria-current={step === index ? "step" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${step === index ? "bg-emerald-700 text-white" : index < step ? "text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"}`}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-[11px]">{index < step ? <Check size={13} /> : index + 1}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl">
              <div className="mb-6">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Step {step + 1} of {CAMPAIGN_STEPS.length}</p>
                <h3 tabIndex={-1} className="mt-1 text-2xl font-black tracking-tight outline-none sm:text-3xl">{CAMPAIGN_STEPS[step].label}</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">{DESCRIPTIONS[stepId]}</p>
              </div>
              {stepId === "campaign" ? <CampaignStep {...stepProps} /> : null}
              {stepId === "audience" ? <AudienceStep {...stepProps} estimate={estimate} onEstimate={estimateNow} busy={estimating} /> : null}
              {stepId === "presentation" ? <PresentationStep {...stepProps} /> : null}
              {stepId === "content" ? <ContentStep {...stepProps} /> : null}
              {stepId === "action" ? <ActionStep {...stepProps} /> : null}
              {stepId === "schedule" ? <ScheduleStep {...stepProps} /> : null}
              {stepId === "preview" ? <CampaignPreviewStep form={form} canTest={permissions.canTest} ensureSaved={ensureSaved} busy={busy} /> : null}
              {stepId === "review" ? (
                <CampaignReviewStep
                  form={form}
                  estimate={estimate}
                  estimating={estimating}
                  onEstimate={estimateNow}
                  permissions={permissions}
                  busy={busy}
                  onSubmit={submit}
                  onGoToStep={(id) => goTo(CAMPAIGN_STEPS.findIndex((item) => item.id === id))}
                />
              ) : null}
              {error ? <p role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}
            </div>
          </main>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
          <button type="button" disabled={step === 0 || busy} onClick={() => { setError(""); setStep((value) => Math.max(0, value - 1)); }} className="campaign-action">
            <ChevronLeft size={16} /> Back
          </button>
          <button type="button" onClick={save} disabled={busy} className="campaign-action sm:hidden" aria-label="Save draft">
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
          </button>
          {step < CAMPAIGN_STEPS.length - 1 ? (
            <button type="button" disabled={busy} onClick={() => goTo(step + 1)} className="campaign-action border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800">
              Continue <ChevronRight size={16} />
            </button>
          ) : <span className="w-24" aria-hidden="true" />}
        </footer>
      </section>
    </div>
  );
}
