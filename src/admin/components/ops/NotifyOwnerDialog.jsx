import { useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { ACTION_SCREENS } from "../../../Backend/services/campaigns/campaignModel";
import { TARGET_TYPES } from "../../operationsConfig";
import { sendOwnerNotification } from "../../operationsService";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";
import { FieldLabel, OpsDialog, PrimaryButton, SecondaryButton, inputClass, textareaClass } from "./OpsPrimitives";

const PRIORITIES = [
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];

export default function NotifyOwnerDialog({ targetType, target, onClose, onDone }) {
  const platform = TARGET_TYPES[targetType]?.sector === "marketplace" ? "urmall" : "urride";
  const destinations = useMemo(() => ACTION_SCREENS.filter((item) => item.platforms.includes(platform)), [platform]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionTarget, setActionTarget] = useState(TARGET_TYPES[targetType]?.ownerScreen || "");
  const [priority, setPriority] = useState("normal");
  const [step, setStep] = useState("compose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function review() {
    if (title.trim().length < 3 || title.trim().length > 120) { setError("The title must be 3 to 120 characters."); return; }
    if (body.trim().length < 10) { setError("The message must be at least 10 characters."); return; }
    setError("");
    setStep("preview");
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const result = await sendOwnerNotification({ targetType, targetId: target.id, title: title.trim(), body: body.trim(), actionTarget, priority });
      onDone?.(result);
    } catch (nextError) {
      setError(inlineErrorMessage(nextError, "The notice could not be sent."));
      setBusy(false);
    }
  }

  const destinationLabel = destinations.find((item) => item.value === actionTarget)?.label;

  return (
    <OpsDialog
      eyebrow="Direct notice"
      title={`Notify ${target.ownerName || "the owner"}`}
      onClose={onClose}
      busy={busy}
      footer={step === "compose" ? (
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={review}>Preview</PrimaryButton>
        </>
      ) : (
        <>
          <SecondaryButton onClick={() => setStep("compose")} disabled={busy}>Edit</SecondaryButton>
          <PrimaryButton tone="emerald" busy={busy} onClick={send}>Send notice</PrimaryButton>
        </>
      )}
    >
      {step === "compose" ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs font-semibold leading-5 text-zinc-600">
            Goes to the owner of <span className="font-black text-zinc-900">{target.label}</span> in their KunThai notifications. It is logged on this record and in the audit log.
          </p>
          <div>
            <FieldLabel htmlFor="notice-title" hint={`${title.trim().length}/120`}>Title</FieldLabel>
            <input id="notice-title" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
          </div>
          <div>
            <FieldLabel htmlFor="notice-body" hint={`${body.trim().length}/2000`}>Message</FieldLabel>
            <textarea id="notice-body" rows={5} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} className={textareaClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="notice-cta" hint="Optional">Button opens</FieldLabel>
              <select id="notice-cta" value={actionTarget} onChange={(event) => setActionTarget(event.target.value)} className={inputClass}>
                <option value="">No button</option>
                {destinations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="notice-priority">Priority</FieldLabel>
              <select id="notice-priority" value={priority} onChange={(event) => setPriority(event.target.value)} className={inputClass}>
                {PRIORITIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">What the owner will see</p>
          <article className="rounded-xl border border-zinc-200 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><BellRing size={18} /></span>
              <div className="min-w-0">
                <p className="text-sm font-black text-zinc-950">{title.trim()}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-5 text-zinc-600">{body.trim()}</p>
                {destinationLabel ? <span className="mt-3 inline-flex h-8 items-center rounded-lg bg-zinc-950 px-3 text-xs font-black text-white">Open {destinationLabel}</span> : null}
              </div>
            </div>
          </article>
          <p className="text-xs font-semibold text-zinc-500">Priority: {PRIORITIES.find((item) => item.key === priority)?.label}. Sending cannot be undone.</p>
        </div>
      )}
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
    </OpsDialog>
  );
}
