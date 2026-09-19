import { useEffect, useState } from "react";
import { AlertTriangle, Globe2, LoaderCircle, Send, UsersRound } from "lucide-react";

import {
  ACTION_ENTITIES,
  ACTION_SCREENS,
  CAMPAIGN_INBOXES,
  CAMPAIGN_SCREENS,
  describeAudience,
  presentationIsInApp,
  presentationMeta,
} from "../../Backend/services/campaigns/campaignModel";
import { formatDateTime, titleCase } from "../adminConfig";
import { AUDIENCE_SEGMENTS, CAMPAIGN_CATEGORIES, buildCampaignPayload, describeCampaignLocation, firstCampaignError, isWorldwideCampaign } from "../notificationCampaignConfig";
import { Notice, ReviewRow } from "./campaignUi";

const LARGE_AUDIENCE = 1000;

function actionSummary(action) {
  if (action.type === "screen") return `${action.label} → ${ACTION_SCREENS.find((item) => item.value === action.screen)?.label || action.screen}`;
  if (action.type === "entity") return `${action.label} → ${ACTION_ENTITIES.find((item) => item.value === action.entityKind)?.label || "Item"} ${action.entityId}`;
  if (action.type === "external") return `${action.label} → ${action.url}`;
  return "No action";
}

export default function CampaignReviewStep({ form, estimate, onEstimate, estimating, permissions, busy, onSubmit, onGoToStep }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const payload = buildCampaignPayload(form);
  const problem = firstCampaignError(form, { canCritical: permissions.canCritical });
  const worldwide = isWorldwideCampaign(payload);
  const large = estimate !== null && estimate >= LARGE_AUDIENCE;
  const everyone = payload.filter.targets.includes("all");
  const needsAcknowledgement = worldwide || large;
  const scheduled = form.schedule.mode === "later";
  const inApp = presentationIsInApp(form.presentation.type);
  const canSend = permissions.canApprove || permissions.canPublish;

  useEffect(() => {
    if (estimate === null && !problem) onEstimate();
    // Calculate once when the review opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAcknowledged(false);
  }, [estimate, worldwide]);

  const primaryLabel = !canSend ? "Submit for approval" : scheduled ? "Approve & schedule" : "Approve & send now";

  return (
    <div className="space-y-5">
      {problem ? (
        <Notice tone="danger" icon={AlertTriangle}>
          <p>{problem.message}</p>
          <button type="button" onClick={() => onGoToStep(problem.step)} className="mt-2 font-black underline">Fix this step</button>
        </Notice>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <ReviewRow label="Campaign" value={`${form.campaign.name} · ${CAMPAIGN_CATEGORIES.find(([value]) => value === form.campaign.category)?.[1] || form.campaign.category} · ${titleCase(form.campaign.priority)} priority`} />
        <ReviewRow label="Audience" value={form.audienceMode === "users" ? `${describeAudience(form.audience)} · ${form.users.map((user) => user.public_id).join(", ")}` : describeAudience(form.audience)} />
        {form.audienceMode !== "users" ? (
          <ReviewRow
            label="Location"
            value={form.locationMode === "countries" ? form.locations.map(describeCampaignLocation).join("; ") : "All locations"}
          />
        ) : null}
        {form.segments.length && form.audienceMode !== "users" ? <ReviewRow label="Activity" value={form.segments.map((segment) => AUDIENCE_SEGMENTS.find(([value]) => value === segment)?.[1] || segment).join(", ")} /> : null}
        <ReviewRow label="Presentation" value={`${presentationMeta(form.presentation.type)?.label || form.presentation.type}${inApp ? ` · ${titleCase(form.presentation.openingAnimation)} in, ${titleCase(form.presentation.closingAnimation)} out` : ""}`} />
        <ReviewRow label="Destination" value={[inApp ? CAMPAIGN_SCREENS[form.presentation.screen]?.label : "", presentationMeta(form.presentation.type)?.inbox ? CAMPAIGN_INBOXES[payload.configuration.inbox] : ""].filter(Boolean).join(" + ")} />
        <ReviewRow label="Content">
          <p className="font-black">{form.content.title}</p>
          <p className="mt-1 whitespace-pre-line font-semibold text-zinc-600 dark:text-zinc-300">{form.content.body}</p>
        </ReviewRow>
        <ReviewRow label="Action" value={actionSummary(form.action)} />
        <ReviewRow label="Channels" value={form.channels.includes("push") ? "In-app + device push" : "In-app"} />
        <ReviewRow label="Schedule" value={`${scheduled ? `Starts ${formatDateTime(payload.schedule)}` : "Starts when published"} · ${payload.expiresAt ? `ends ${formatDateTime(payload.expiresAt)}` : "no end date"} · ${form.schedule.timeZone}`} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-zinc-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between dark:bg-zinc-900">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Estimated recipients</p>
          <p className="mt-1 text-3xl font-black" aria-live="polite">{estimate === null ? "Not calculated" : Number(estimate).toLocaleString()}</p>
          <p className="mt-1 text-xs font-semibold text-zinc-400">Counted from current KunThai data. The server recounts when it sends.</p>
        </div>
        <button type="button" onClick={onEstimate} disabled={estimating || Boolean(problem)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50">
          {estimating ? <LoaderCircle className="animate-spin" size={16} /> : <UsersRound size={16} />} Recalculate
        </button>
      </section>

      {estimate === 0 && !problem ? <Notice tone="warning" icon={AlertTriangle}>No KunThai account matches this audience right now, so nobody would receive it.</Notice> : null}
      {everyone ? <Notice tone="warning" icon={Globe2}>This campaign targets <strong>all KunThai users</strong>. A second administrator must approve it.</Notice> : null}
      {needsAcknowledgement && !everyone ? (
        <Notice tone="warning" icon={Globe2}>{large ? `This campaign reaches ${Number(estimate).toLocaleString()} people and needs a second administrator's approval.` : "This campaign has no location limit."}</Notice>
      ) : null}

      {needsAcknowledgement && canSend && !problem ? (
        <label className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-700" />
          <span>I have checked the audience{estimate !== null ? ` of ${Number(estimate).toLocaleString()} people` : ""} and want to {scheduled ? "schedule" : "send"} this campaign.</span>
        </label>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy || Boolean(problem)} onClick={() => onSubmit({ mode: "save" })} className="campaign-action">
          Save as draft
        </button>
        <button
          type="button"
          disabled={busy || Boolean(problem) || estimate === null || (canSend && needsAcknowledgement && !acknowledged)}
          onClick={() => onSubmit({ mode: canSend ? (scheduled ? "schedule" : "send") : "submit", expectedAudience: estimate, confirmWorldwide: acknowledged || !worldwide })}
          className="campaign-action border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} {primaryLabel}
        </button>
      </div>
      {!canSend ? <p className="text-right text-xs font-semibold text-zinc-500">An administrator with approval permission will review and send it.</p> : null}
    </div>
  );
}
