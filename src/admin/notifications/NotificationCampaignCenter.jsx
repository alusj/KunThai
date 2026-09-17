import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Check,
  CheckCircle2,
  FlaskConical,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import {
  approveNotificationCampaign,
  cancelNotificationCampaign,
  checkNotificationCampaignTestRecipient,
  createNotificationCampaign,
  endNotificationCampaign,
  estimateNotificationCampaignAudience,
  getNotificationCampaigns,
  lookupNotificationCampaignUser,
  publishNotificationCampaign,
  runDueNotificationCampaigns,
  sendNotificationCampaignTest,
  updateNotificationCampaign,
} from "../adminService";
import { formatDateTime, titleCase } from "../adminConfig";
import {
  CAMPAIGN_SCREENS,
  DISPLAY_STATUS_LABELS,
  campaignDisplayStatus,
  describeAudience,
  presentationMeta,
} from "../../Backend/services/campaigns/campaignModel";
import {
  buildCampaignPayload,
  campaignToEditorForm,
  createEmptyCampaignForm,
  isWorldwideCampaign,
} from "../notificationCampaignConfig";
import CampaignAnalyticsPanel from "./CampaignAnalyticsPanel";
import CampaignBuilder from "./CampaignBuilder";
import { Modal, Notice, StatusChip } from "./campaignUi";

const TABS = [
  ["all", "All"],
  ["drafts", "Drafts & approval"],
  ["scheduled", "Scheduled"],
  ["active", "Active"],
  ["completed", "Completed"],
  ["stopped", "Failed & cancelled"],
];

function tabFor(status) {
  if (["draft", "awaiting_approval", "ready"].includes(status)) return "drafts";
  if (["scheduled", "sending"].includes(status)) return "scheduled";
  if (status === "active") return "active";
  if (status === "completed") return "completed";
  return "stopped";
}

function audienceLabel(campaign) {
  const config = campaign.configuration || {};
  if (config.audience?.platform) {
    const users = campaign.audience_type === "specific_users" ? ` · ${campaign.audience_filter?.kunthaiIds?.length || campaign.audience_filter?.userIds?.length || 0} KunThai IDs` : "";
    return `${describeAudience(config.audience)}${users}`;
  }
  const targets = config.targetPaths || campaign.audience_filter?.targets || [];
  return targets.length ? targets.join(", ") : campaign.sector || "platform";
}

function presentationLabel(campaign) {
  const meta = presentationMeta(campaign.presentation);
  const screen = campaign.configuration?.presentation?.screen;
  return [meta?.label || titleCase(campaign.presentation || "inbox"), screen ? CAMPAIGN_SCREENS[screen]?.label : ""].filter(Boolean).join(" · ");
}

export default function NotificationCampaignCenter({ access }) {
  const permissions = useMemo(() => {
    const has = (key) => access.permissions.includes(key);
    return {
      canManage: has("notifications.manage"),
      canApprove: has("notifications.approve"),
      canPublish: has("notifications.publish") || has("notifications.approve"),
      canTest: has("notifications.test") || has("notifications.manage"),
      canCritical: has("notifications.critical"),
      canAnalytics: has("notifications.analytics") || has("notifications.view"),
    };
  }, [access.permissions]);

  const [campaigns, setCampaigns] = useState([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [builder, setBuilder] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [testing, setTesting] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [stopping, setStopping] = useState(null);

  const load = useCallback(async ({ releaseDue = false } = {}) => {
    setLoading(true);
    setError("");
    try {
      if (releaseDue) await runDueNotificationCampaigns().catch(() => 0);
      setCampaigns(await getNotificationCampaigns());
    } catch (nextError) {
      setError(nextError.message || "Campaigns could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ releaseDue: true });
  }, [load]);

  const rows = useMemo(() => campaigns.map((campaign) => ({ campaign, status: campaignDisplayStatus(campaign) })), [campaigns]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([key]) => [key, key === "all" ? rows.length : rows.filter((row) => tabFor(row.status) === key).length])), [rows]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return rows.filter((row) => (tab === "all" || tabFor(row.status) === tab)
      && (!text || [row.campaign.campaign_name, row.campaign.title, ...(row.campaign.configuration?.campaign?.tags || [])].some((value) => String(value || "").toLowerCase().includes(text))));
  }, [query, rows, tab]);

  function replaceCampaign(updated) {
    if (!updated?.id) return;
    setCampaigns((current) => (current.some((item) => item.id === updated.id) ? current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) : [updated, ...current]));
  }

  async function saveForm(form, campaignId) {
    const payload = buildCampaignPayload(form);
    const saved = campaignId ? await updateNotificationCampaign(campaignId, payload) : await createNotificationCampaign(payload);
    replaceCampaign(saved);
    return saved;
  }

  // Review & send: save, then approve and publish/schedule as far as this
  // administrator's permissions and KunThai's approval rules allow.
  async function submitForm(form, campaignId, { mode, confirmWorldwide }) {
    const saved = await saveForm(form, campaignId);
    if (mode === "save" || mode === "submit") {
      setBuilder(null);
      setTab("drafts");
      setNotice(mode === "submit" ? "Campaign saved for approval." : "Draft saved.");
      return;
    }
    let approved;
    try {
      approved = await approveNotificationCampaign(saved.id);
      replaceCampaign(approved);
    } catch (approvalError) {
      setBuilder(null);
      setTab("drafts");
      setNotice(`Campaign saved. ${approvalError.message || "It still needs approval."}`);
      return;
    }
    if (approved.status === "scheduled") {
      setBuilder(null);
      setTab("scheduled");
      setNotice(`Scheduled for ${formatDateTime(approved.scheduled_at)}.`);
      return;
    }
    const published = await publishNotificationCampaign(saved.id, { expectedAudience: saved.estimated_audience, confirmWorldwide });
    replaceCampaign(published);
    setBuilder(null);
    setTab("active");
    setNotice(`Sent to ${Number(published.delivery_count || 0).toLocaleString()} ${Number(published.delivery_count) === 1 ? "person" : "people"}.`);
  }

  async function runAction(campaignId, action, successMessage) {
    setBusyId(campaignId);
    setError("");
    setNotice("");
    try {
      const updated = await action();
      replaceCampaign(updated);
      if (successMessage) setNotice(typeof successMessage === "function" ? successMessage(updated) : successMessage);
      return updated;
    } catch (nextError) {
      setError(nextError.message || "That action could not be completed.");
      return null;
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-5 text-zinc-950 dark:text-zinc-50">
      <header className="rounded-[24px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400"><Sparkles size={15} /> Communications</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Notification campaigns</h1>
            <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">Target real KunThai audiences, choose the exact interface, test on a real account and measure real delivery.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => load({ releaseDue: true })} disabled={loading} className="campaign-action"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button>
            {permissions.canManage ? (
              <button type="button" onClick={() => { setNotice(""); setBuilder({ id: "", form: createEmptyCampaignForm() }); }} className="campaign-action border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800">
                <Plus size={16} /> New campaign
              </button>
            ) : null}
          </div>
        </div>
        <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div role="tablist" aria-label="Campaign status" className="flex flex-wrap gap-1.5">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`campaign-chip ${tab === key ? "campaign-chip-selected" : ""}`}>
                  {label} <span className="ml-1.5 opacity-70">{counts[key]}</span>
                </button>
              ))}
            </div>
            <label className="relative min-w-0 lg:ml-auto lg:w-72">
              <span className="sr-only">Search campaigns</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, title or tag" className="campaign-input pl-9" />
            </label>
          </div>
        </div>
      </header>

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={17} /></button>
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <span className="min-w-0 flex-1 break-words">{notice}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={17} /></button>
        </div>
      ) : null}

      {loading && !campaigns.length ? (
        <div className="grid min-h-56 place-items-center rounded-[24px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"><LoaderCircle className="animate-spin text-emerald-600" size={28} /></div>
      ) : null}
      {!loading && !visible.length ? (
        <div className="rounded-[24px] border border-dashed border-zinc-300 bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-950">
          <Inbox className="mx-auto text-zinc-300" size={34} />
          <h2 className="mt-3 text-lg font-black">{campaigns.length ? "No campaigns match" : "No campaigns yet"}</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-500">{campaigns.length ? "Try another tab or search." : "Create a campaign to reach KunThai users."}</p>
        </div>
      ) : null}

      <ul className="grid gap-3">
        {visible.map(({ campaign, status }) => {
          const busy = busyId === campaign.id;
          const editable = ["draft", "awaiting_approval", "ready", "scheduled", "failed"].includes(status);
          return (
            <li key={campaign.id} className="rounded-[22px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 sm:grid dark:bg-emerald-950/40"><BellRing size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words text-base font-black">{campaign.campaign_name || campaign.title}</h2>
                    <StatusChip status={status} label={DISPLAY_STATUS_LABELS[status] || status} />
                  </div>
                  <p className="mt-1 break-words text-sm font-bold text-zinc-700 dark:text-zinc-300">{campaign.title}</p>
                  <p className="mt-0.5 line-clamp-2 break-words text-xs font-semibold leading-5 text-zinc-500">{campaign.body}</p>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs font-semibold text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
                    <div className="min-w-0"><dt className="inline font-black">Audience: </dt><dd className="inline break-words">{audienceLabel(campaign)}</dd></div>
                    <div className="min-w-0"><dt className="inline font-black">Shown as: </dt><dd className="inline">{presentationLabel(campaign)}</dd></div>
                    <div><dt className="inline font-black">Recipients: </dt><dd className="inline">{Number(campaign.delivery_count || campaign.estimated_audience || 0).toLocaleString()}{campaign.sent_at ? " delivered" : " estimated"}</dd></div>
                    <div><dt className="inline font-black">{campaign.sent_at ? "Sent: " : "Starts: "}</dt><dd className="inline">{campaign.sent_at ? formatDateTime(campaign.sent_at) : campaign.scheduled_at ? formatDateTime(campaign.scheduled_at) : "When published"}{campaign.expires_at ? ` · ends ${formatDateTime(campaign.expires_at)}` : ""}</dd></div>
                  </dl>
                  {status === "failed" && campaign.last_error ? <p className="mt-2 rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">Failed: {campaign.last_error}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">
                  {permissions.canManage && editable ? (
                    <button type="button" disabled={busy} onClick={() => { setNotice(""); setBuilder({ id: campaign.id, form: campaignToEditorForm(campaign) }); }} className="campaign-action"><Pencil size={15} /> Edit</button>
                  ) : null}
                  {permissions.canTest && editable ? (
                    <button type="button" disabled={busy} onClick={() => setTesting(campaign)} className="campaign-action text-sky-700"><FlaskConical size={15} /> Test</button>
                  ) : null}
                  {permissions.canApprove && ["draft", "awaiting_approval", "failed"].includes(status) ? (
                    <button type="button" disabled={busy} onClick={() => runAction(campaign.id, () => approveNotificationCampaign(campaign.id), (updated) => (updated.status === "scheduled" ? `Approved and scheduled for ${formatDateTime(updated.scheduled_at)}.` : "Approved. It is ready to send."))} className="campaign-action text-emerald-700">
                      {busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} Approve
                    </button>
                  ) : null}
                  {permissions.canPublish && status === "ready" ? (
                    <button type="button" disabled={busy} onClick={() => setPublishing(campaign)} className="campaign-action border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"><Send size={15} /> Send</button>
                  ) : null}
                  {permissions.canAnalytics && (campaign.sent_at || ["active", "completed", "sending"].includes(status)) ? (
                    <button type="button" onClick={() => setAnalytics(campaign)} className="campaign-action"><BarChart3 size={15} /> Analytics</button>
                  ) : null}
                  {(permissions.canManage || permissions.canPublish) && status === "active" ? (
                    <button type="button" disabled={busy} onClick={() => setStopping({ campaign, kind: "end" })} className="campaign-action text-amber-700"><Square size={15} /> End</button>
                  ) : null}
                  {permissions.canManage && editable ? (
                    <button type="button" disabled={busy} onClick={() => setStopping({ campaign, kind: "cancel" })} className="campaign-action text-rose-700"><X size={15} /> Cancel</button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {builder ? (
        <CampaignBuilder
          key={builder.id || "new"}
          initialForm={builder.form}
          campaignId={builder.id}
          permissions={permissions}
          onClose={() => { setBuilder(null); load(); }}
          onSave={saveForm}
          onEstimate={estimateNotificationCampaignAudience}
          onSubmit={submitForm}
        />
      ) : null}
      {analytics ? <CampaignAnalyticsPanel campaign={analytics} onClose={() => setAnalytics(null)} /> : null}
      {testing ? <TestSendModal campaign={testing} onClose={() => setTesting(null)} /> : null}
      {publishing ? (
        <PublishModal
          campaign={publishing}
          busy={busyId === publishing.id}
          onClose={() => setPublishing(null)}
          onConfirm={async (confirmation) => {
            const published = await runAction(publishing.id, () => publishNotificationCampaign(publishing.id, confirmation), (updated) => `Sent to ${Number(updated.delivery_count || 0).toLocaleString()} people.`);
            if (published) {
              setPublishing(null);
              setTab("active");
            }
          }}
        />
      ) : null}
      {stopping ? (
        <ReasonModal
          kind={stopping.kind}
          campaign={stopping.campaign}
          busy={busyId === stopping.campaign.id}
          onClose={() => setStopping(null)}
          onConfirm={async (reason) => {
            const id = stopping.campaign.id;
            const done = stopping.kind === "end"
              ? await runAction(id, () => endNotificationCampaign(id, reason), "Campaign ended. Cards stop showing and inbox copies expire; analytics are kept.")
              : await runAction(id, () => cancelNotificationCampaign(id, reason), "Campaign cancelled.");
            if (done) setStopping(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TestSendModal({ campaign, onClose }) {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "", match: null });
  const screen = campaign.configuration?.presentation?.screen;

  async function find() {
    setUser(null);
    setState({ status: "looking", message: "", match: null });
    try {
      const found = await lookupNotificationCampaignUser(query);
      if (!found) throw new Error("No KunThai account uses that ID.");
      setUser(found);
      setState({ status: "idle", message: "", match: null });
    } catch (error) {
      setState({ status: "error", message: error.message, match: null });
    }
  }

  async function send() {
    setState({ status: "sending", message: "", match: null });
    try {
      const [match] = await Promise.all([
        checkNotificationCampaignTestRecipient(campaign.id, user.user_id).catch(() => null),
        sendNotificationCampaignTest(campaign.id, user.user_id),
      ]);
      setState({ status: "sent", message: "", match });
    } catch (error) {
      setState({ status: "error", message: error.message || "The test could not be sent.", match: null });
    }
  }

  return (
    <Modal title="Send a real test" description={campaign.campaign_name || campaign.title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm font-semibold leading-6 text-zinc-500">Delivers this campaign, exactly as configured, to one KunThai account. It is marked [TEST], removed after 24 hours and not counted in analytics.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={query} onChange={(event) => { setQuery(event.target.value); setUser(null); }} placeholder="KTU-XXXX-XXXX-XXXX" aria-label="Test account KunThai ID" className="campaign-input min-w-0 flex-1" />
          <button type="button" onClick={find} disabled={!query.trim() || state.status === "looking"} className="campaign-action shrink-0">
            {state.status === "looking" ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />} Find
          </button>
        </div>
        {user ? (
          <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900">
            <p className="font-black">{user.display_name}</p>
            <p className="text-xs font-bold text-zinc-500">{user.public_id}{user.city || user.country ? ` · ${[user.city, user.country].filter(Boolean).join(", ")}` : ""}</p>
          </div>
        ) : null}
        {state.status === "error" ? <Notice tone="danger" icon={AlertTriangle}>{state.message}</Notice> : null}
        {state.status === "sent" ? (
          <Notice tone="success" icon={CheckCircle2}>
            Delivered to {user.public_id}. Open KunThai as that account{screen ? ` on the ${CAMPAIGN_SCREENS[screen]?.label}` : " and check its notification inbox"}.
            {state.match && (!state.match.matchesAudience || !state.match.matchesLocation) ? " This account is outside the real audience, so it may not have that screen." : ""}
          </Notice>
        ) : null}
        <button type="button" onClick={send} disabled={!user || state.status === "sending"} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 font-black text-white hover:bg-sky-800 disabled:opacity-40">
          {state.status === "sending" ? <LoaderCircle className="animate-spin" size={17} /> : <FlaskConical size={17} />} Send test
        </button>
      </div>
    </Modal>
  );
}

function PublishModal({ campaign, busy, onClose, onConfirm }) {
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const worldwide = isWorldwideCampaign(campaign);

  useEffect(() => {
    estimateNotificationCampaignAudience({ sector: campaign.sector, audience: campaign.audience_type, filter: campaign.audience_filter })
      .then((value) => setEstimate(Number(value || 0)))
      .catch((nextError) => setError(nextError.message || "The audience could not be counted."));
  }, [campaign]);

  return (
    <Modal title="Send campaign" description={campaign.campaign_name || campaign.title} onClose={onClose} closeDisabled={busy}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-zinc-950 p-5 text-white">
          <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Current audience</p>
          <p className="mt-1 text-3xl font-black">{estimate === null ? "Counting…" : `${estimate.toLocaleString()} ${estimate === 1 ? "person" : "people"}`}</p>
          <p className="mt-1 text-xs font-semibold text-zinc-400">{audienceLabel(campaign)} · {presentationLabel(campaign)}</p>
        </div>
        {error ? <Notice tone="danger" icon={AlertTriangle}>{error}</Notice> : null}
        {estimate === 0 ? <Notice tone="warning" icon={AlertTriangle}>Nobody matches this audience right now.</Notice> : null}
        <label className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-700" />
          <span>{worldwide ? "This campaign has no location limit. " : ""}I confirm sending it to {estimate === null ? "this audience" : `${estimate.toLocaleString()} people`}.</span>
        </label>
        <button
          type="button"
          disabled={busy || estimate === null || !acknowledged}
          onClick={() => onConfirm({ expectedAudience: estimate, confirmWorldwide: true })}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-black text-white hover:bg-emerald-800 disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />} Send now
        </button>
      </div>
    </Modal>
  );
}

function ReasonModal({ kind, campaign, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const ending = kind === "end";
  return (
    <Modal title={ending ? "End campaign" : "Cancel campaign"} description={campaign.campaign_name || campaign.title} onClose={onClose} closeDisabled={busy}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length >= 5) onConfirm(reason.trim()); }}>
        <p className="text-sm font-semibold leading-6 text-zinc-500">
          {ending ? "On-screen cards stop showing and inbox copies expire now. Delivery analytics are kept." : "The campaign will never be sent. This cannot be undone."}
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-black">Reason (recorded in the audit log)</span>
          <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="campaign-input min-h-24 py-3" />
        </label>
        <button type="submit" disabled={busy || reason.trim().length < 5} className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl font-black text-white disabled:opacity-40 ${ending ? "bg-amber-700 hover:bg-amber-800" : "bg-rose-700 hover:bg-rose-800"}`}>
          {busy ? <LoaderCircle className="animate-spin" size={17} /> : ending ? <Square size={17} /> : <X size={17} />} {ending ? "End campaign" : "Cancel campaign"}
        </button>
      </form>
    </Modal>
  );
}
