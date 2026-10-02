import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  CAPABILITIES,
  DURATION_OPTIONS,
  ENFORCEMENT_ACTIONS,
  ENFORCEMENT_REASONS,
  RESTORATION_REASONS,
  TARGET_TYPES,
  durationEndsAt,
  validateEnforcementInput,
} from "../../operationsConfig";
import { applyEnforcement } from "../../operationsService";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";
import { FieldLabel, OpsDialog, PrimaryButton, SecondaryButton, inputClass, textareaClass } from "./OpsPrimitives";
import { formatDateTimeShort } from "./opsUtils";

const MESSAGE_STARTERS = {
  warning: "We noticed activity on your account that goes against KunThai's policies. Please review it and make sure it does not happen again.",
  restriction: "Some features on your account are paused while we review a policy concern.",
  temporary_suspension: "Your account is temporarily suspended while we review a policy concern.",
  suspension: "Your account is suspended because of a serious policy concern. Contact KunThai support if you believe this is a mistake.",
  restoration: "Thank you for your patience. Your account is fully active again.",
};

function impactLines(action, targetType, capabilities, endsAt) {
  const noun = TARGET_TYPES[targetType]?.noun || "account";
  const capabilityDetails = (CAPABILITIES[targetType] || []).filter((item) => capabilities.includes(item.key)).map((item) => item.detail);
  if (action === "warning") return [`The owner receives a formal warning. Nothing about the ${noun} changes.`, "The warning is kept in the enforcement history."];
  if (action === "restriction") {
    return [
      ...capabilityDetails,
      endsAt ? `Lifts automatically on ${formatDateTimeShort(endsAt)}.` : "Stays in place until someone restores it.",
      `Everything else keeps working. The ${noun} is not deleted.`,
    ];
  }
  if (action === "temporary_suspension" || action === "suspension") {
    return [
      targetType === "marketplace_business"
        ? "The business, its products, menus, rooms and listings disappear from UrMall for buyers. No new orders or bookings."
        : targetType === "transport_operator"
          ? "The operator's vehicles disappear for passengers and they cannot receive or accept trips."
          : "Every company vehicle disappears for passengers, no new trips, and no new operator invites.",
      action === "temporary_suspension" && endsAt ? `Lifts automatically on ${formatDateTimeShort(endsAt)}.` : "Stays in place until someone with suspend permission restores it.",
      "The owner can still sign in and see what happened. Nothing is deleted.",
    ];
  }
  return ["All restrictions and suspensions are lifted immediately.", "The owner is told their account is active again."];
}

export default function EnforcementDialog({ targetType, target, action, onClose, onDone }) {
  const spec = ENFORCEMENT_ACTIONS[action];
  const isRestoration = action === "restoration";
  const isSuspension = action === "temporary_suspension" || action === "suspension";
  const [reasonCode, setReasonCode] = useState("");
  const [publicMessage, setPublicMessage] = useState(MESSAGE_STARTERS[action] || "");
  const [internalNote, setInternalNote] = useState("");
  const [capabilities, setCapabilities] = useState([]);
  const [duration, setDuration] = useState(action === "temporary_suspension" ? "7d" : "");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const endsAt = useMemo(() => (duration ? durationEndsAt(duration) : null), [duration]);
  const confirmWord = "SUSPEND";
  const reasons = isRestoration ? RESTORATION_REASONS : ENFORCEMENT_REASONS;

  async function submit() {
    const problem = validateEnforcementInput({ action, reasonCode, publicMessage, internalNote, capabilities, endsAt });
    if (problem) { setError(problem); return; }
    if (isSuspension && confirmText.trim().toUpperCase() !== confirmWord) {
      setError(`Type ${confirmWord} to confirm.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await applyEnforcement({
        targetType,
        targetId: target.id,
        action,
        reasonCode,
        publicMessage: publicMessage.trim(),
        internalNote: internalNote.trim(),
        capabilities,
        endsAt: action === "restriction" || action === "temporary_suspension" ? endsAt : null,
      });
      onDone?.(result);
    } catch (nextError) {
      setError(inlineErrorMessage(nextError, "This decision could not be applied."));
      setBusy(false);
    }
  }

  return (
    <OpsDialog
      eyebrow={`${spec.label} · ${TARGET_TYPES[targetType]?.noun}`}
      title={target.label}
      onClose={onClose}
      busy={busy}
      width="max-w-xl"
      footer={(
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton tone={spec.tone === "emerald" ? "emerald" : spec.tone === "amber" ? "amber" : spec.tone === "orange" ? "orange" : "red"} busy={busy} onClick={submit}>
            {spec.label}
          </PrimaryButton>
        </>
      )}
    >
      <div className="space-y-4">
        <section className={`rounded-lg border p-3 ${isRestoration ? "border-emerald-200 bg-emerald-50" : isSuspension ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-700"><ShieldAlert size={14} /> What will happen</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-medium leading-5 text-zinc-800">
            {impactLines(action, targetType, capabilities, action === "restriction" || action === "temporary_suspension" ? endsAt : null).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>

        <div>
          <FieldLabel htmlFor="enf-reason">{isRestoration ? "Restoration reason" : "Reason category"}</FieldLabel>
          <select id="enf-reason" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {reasons.map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}
          </select>
        </div>

        {action === "restriction" ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-bold text-zinc-800">Capabilities to pause</legend>
            <div className="grid gap-2">
              {(CAPABILITIES[targetType] || []).map((item) => (
                <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${capabilities.includes(item.key) ? "border-orange-300 bg-orange-50" : "border-zinc-200"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-orange-600"
                    checked={capabilities.includes(item.key)}
                    onChange={() => setCapabilities((current) => (current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key]))}
                  />
                  <span>
                    <span className="block text-sm font-black text-zinc-900">{item.label}</span>
                    <span className="block text-xs font-medium text-zinc-500">{item.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {action === "restriction" || action === "temporary_suspension" ? (
          <div>
            <FieldLabel htmlFor="enf-duration" hint={endsAt ? `Ends ${formatDateTimeShort(endsAt)}` : "No end date"}>Duration</FieldLabel>
            <select id="enf-duration" value={duration} onChange={(event) => setDuration(event.target.value)} className={inputClass}>
              {action === "restriction" ? <option value="">Until restored</option> : null}
              {DURATION_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
        ) : null}

        <div>
          <FieldLabel htmlFor="enf-message" hint="Sent to the owner">Message to the owner</FieldLabel>
          <textarea id="enf-message" rows={4} maxLength={2000} value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} className={textareaClass} />
          <p className="mt-1 text-[11px] font-semibold text-zinc-400">Explain what happened and what they can do. Never include internal details.</p>
        </div>

        <div>
          <FieldLabel htmlFor="enf-note" hint={spec.needsNote ? "Required · staff only" : "Optional · staff only"}>Internal note</FieldLabel>
          <textarea id="enf-note" rows={3} maxLength={4000} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Evidence, case references, who you spoke to…" className={textareaClass} />
        </div>

        {isSuspension ? (
          <div>
            <FieldLabel htmlFor="enf-confirm">Type {confirmWord} to confirm</FieldLabel>
            <input id="enf-confirm" autoComplete="off" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className={inputClass} />
          </div>
        ) : null}

        {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </div>
    </OpsDialog>
  );
}
