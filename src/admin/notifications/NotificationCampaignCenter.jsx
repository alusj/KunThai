import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FlaskConical,
  Globe2,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";

import SuggestedTextSelect from "../components/SuggestedTextSelect";
import { NOTIFICATION_MESSAGE_SUGGESTIONS, NOTIFICATION_TITLE_SUGGESTIONS } from "../adminTextSuggestions";
import {
  approveNotificationCampaign,
  cancelNotificationCampaign,
  createNotificationCampaign,
  estimateNotificationCampaignAudience,
  getNotificationCampaignMetrics,
  getNotificationCampaigns,
  lookupNotificationCampaignUser,
  publishNotificationCampaign,
  sendNotificationCampaignTest,
  updateNotificationCampaign,
} from "../adminService";
import { formatDateTime, titleCase } from "../adminConfig";
import {
  AUDIENCE_SEGMENTS,
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_COUNTRIES,
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_STEPS,
  CLOSING_ANIMATIONS,
  CTA_DESTINATIONS,
  CTA_LABEL_SUGGESTIONS,
  EXPIRATION_OPTIONS,
  FREQUENCY_OPTIONS,
  OPENING_ANIMATIONS,
  PLATFORM_OPTIONS,
  PRESENTATION_OPTIONS,
  URMALL_AREAS,
  URMALL_BUSINESS_TYPES,
  URRIDE_AREAS,
  URRIDE_COMPANY_TYPES,
  URRIDE_DELIVERY_TYPES,
  URRIDE_TRANSPORT_TYPES,
  buildCampaignPayload,
  buildNotificationTargetPaths,
  campaignToEditorForm,
  createEmptyCampaignForm,
  isWorldwideCampaign,
} from "../notificationCampaignConfig";

const HOME_TABS = [
  ["all", "All campaigns"],
  ["drafts", "Drafts"],
  ["scheduled", "Scheduled"],
  ["active", "Active"],
  ["sent", "Sent"],
  ["expired", "Expired"],
  ["analytics", "Analytics"],
];

function toggleValue(values, value, exclusive = "all") {
  if (value === exclusive) return values.includes(exclusive) ? [] : [exclusive];
  const next = values.filter((item) => item !== exclusive);
  return next.includes(value) ? next.filter((item) => item !== value) : [...next, value];
}

function campaignBucket(campaign) {
  if (["draft", "pending_approval", "approved"].includes(campaign.status)) return "drafts";
  if (campaign.status === "scheduled") return "scheduled";
  if (campaign.status === "sending") return "active";
  if (campaign.status === "completed" && campaign.expires_at && new Date(campaign.expires_at).getTime() <= Date.now()) return "expired";
  if (campaign.status === "completed" && (!campaign.expires_at || new Date(campaign.expires_at).getTime() > Date.now())) return "active";
  return campaign.status === "completed" ? "sent" : campaign.status;
}

function readableTarget(path) {
  const labels = {
    all: "Entire KunThai",
    explore: "Explore",
    urfeed: "UrFeed",
    swip: "Swip",
    urmall: "UrMall",
    urride: "UrRide",
    nearby_area: "Nearby Area",
    buyer_dashboard: "Buyer’s dashboard",
    seller_dashboard: "Seller’s dashboard",
    operator_dashboard: "Operator’s dashboard",
    company_dashboard: "Company’s dashboard",
    property_agent: "Real Estate",
    motorbike: "Motorbike",
    tricycle: "Tricycle",
    taxi: "Taxi",
    van: "Van",
  };
  return String(path || "all").split(".").map((part) => labels[part] || titleCase(part)).join(" → ");
}

function statusTone(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "scheduled") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (["failed", "cancelled"].includes(status)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "approved") return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

export default function NotificationCampaignCenter({ access }) {
  const [campaigns, setCampaigns] = useState([]);
  const [tab, setTab] = useState("all");
  const [composer, setComposer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [testPanel, setTestPanel] = useState(null);
  const [publishPanel, setPublishPanel] = useState(null);

  const canManage = access.permissions.includes("notifications.manage");
  const canApprove = access.permissions.includes("notifications.approve");
  const canPublish = canApprove || access.permissions.includes("notifications.publish");
  const canCritical = access.permissions.includes("notifications.critical");

  function load() {
    setLoading(true);
    setError("");
    getNotificationCampaigns()
      .then(setCampaigns)
      .catch((nextError) => setError(nextError.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const counts = useMemo(() => Object.fromEntries(HOME_TABS.map(([key]) => [
    key,
    key === "all" || key === "analytics" ? campaigns.length : campaigns.filter((campaign) => campaignBucket(campaign) === key || (key === "sent" && campaign.status === "completed")).length,
  ])), [campaigns]);

  const visible = useMemo(() => {
    if (["all", "analytics"].includes(tab)) return campaigns;
    return campaigns.filter((campaign) => campaignBucket(campaign) === tab || (tab === "sent" && campaign.status === "completed"));
  }, [campaigns, tab]);

  async function saveCampaign(form, editingId = "") {
    const payload = buildCampaignPayload(form);
    setBusy(true);
    setError("");
    try {
      const saved = editingId ? await updateNotificationCampaign(editingId, payload) : await createNotificationCampaign(payload);
      setCampaigns((current) => editingId ? current.map((item) => item.id === editingId ? { ...item, ...saved } : item) : [saved, ...current]);
      setComposer(null);
      setEstimate(null);
      setTab("drafts");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function estimateCampaign(form) {
    setBusy(true);
    setError("");
    try {
      const value = await estimateNotificationCampaignAudience(buildCampaignPayload(form));
      setEstimate(Number(value || 0));
      return Number(value || 0);
    } catch (nextError) {
      setError(nextError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function approve(id) {
    setBusy(true); setError("");
    try {
      const updated = await approveNotificationCampaign(id);
      setCampaigns((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item));
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function cancel(id) {
    const reason = window.prompt("Why is this campaign being cancelled?");
    if (!reason?.trim()) return;
    setBusy(true); setError("");
    try {
      const updated = await cancelNotificationCampaign(id, reason.trim());
      setCampaigns((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item));
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function showMetrics(id) {
    if (metrics[id]) { setMetrics((current) => ({ ...current, [id]: null })); return; }
    setBusy(true); setError("");
    try {
      const value = await getNotificationCampaignMetrics(id);
      setMetrics((current) => ({ ...current, [id]: value }));
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  async function publish() {
    if (!publishPanel?.campaign) return;
    setBusy(true); setError("");
    try {
      const item = publishPanel.campaign;
      const updated = await publishNotificationCampaign(item.id, {
        expectedAudience: item.estimated_audience,
        confirmWorldwide: publishPanel.worldwideAcknowledged,
      });
      setCampaigns((current) => current.map((campaign) => campaign.id === item.id ? { ...campaign, ...updated } : campaign));
      setPublishPanel(null);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 text-zinc-950 dark:text-zinc-50">
      <header className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400"><Sparkles size={15} /> Communications studio</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Notification Campaign Center</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-zinc-500 dark:text-zinc-400">Target the right KunThai experience and audience, preview premium delivery, require approval, and measure real interaction.</p>
          </div>
          {canManage ? <button type="button" onClick={() => { setComposer({ id: "", form: createEmptyCampaignForm() }); setEstimate(null); setError(""); }} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 transition hover:-translate-y-0.5 hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white"><Plus size={18} /> Create notification</button> : null}
        </div>
        <div className="grid grid-cols-2 border-t border-zinc-100 sm:grid-cols-4 lg:grid-cols-7 dark:border-zinc-800">
          {HOME_TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`border-r border-zinc-100 px-3 py-4 text-left transition last:border-r-0 dark:border-zinc-800 ${tab === key ? "bg-emerald-700 text-white dark:bg-emerald-600 dark:text-white" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}><span className="block text-xl font-black">{counts[key]}</span><span className="mt-0.5 block text-[10px] font-black uppercase tracking-wide opacity-70">{label}</span></button>)}
        </div>
      </header>

      {error ? <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><span className="flex-1">{error}</span><button type="button" onClick={() => setError("")}><X size={17} /></button></div> : null}

      {loading ? <div className="grid min-h-64 place-items-center rounded-[28px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"><LoaderCircle className="animate-spin text-emerald-600" size={30} /></div> : null}
      {!loading && !visible.length ? <div className="rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950"><Inbox className="mx-auto text-zinc-300" size={36} /><h2 className="mt-4 text-lg font-black">No campaigns here yet</h2><p className="mt-1 text-sm font-semibold text-zinc-500">Create a notification or choose another campaign stage.</p></div> : null}

      <div className="grid gap-4">
        {visible.map((item) => {
          const paths = item.configuration?.targetPaths || item.audience_filter?.targets || [];
          const itemMetrics = metrics[item.id];
          return <article key={item.id} className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><BellRing size={21} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black">{item.campaign_name || item.title}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${statusTone(item.status)}`}>{titleCase(item.status)}</span><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{titleCase(item.presentation || "inbox")}</span></div>
                <p className="mt-1 text-sm font-semibold text-zinc-600 dark:text-zinc-300">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-zinc-500">{item.body}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{(paths.length ? paths : [item.sector || "platform"]).slice(0, 4).map((path) => <span key={path} className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">{readableTarget(path)}</span>)}</div>
              </div>
              <div className="min-w-40 text-xs font-semibold text-zinc-500"><p className="text-lg font-black text-zinc-950 dark:text-white">{Number(item.estimated_audience || 0).toLocaleString()}</p><p>estimated recipients</p><p className="mt-2">{item.scheduled_at ? formatDateTime(item.scheduled_at) : item.sent_at ? `Sent ${formatDateTime(item.sent_at)}` : "Not scheduled"}</p></div>
              <div className="flex flex-wrap gap-2">
                {canManage && ["draft", "pending_approval"].includes(item.status) ? <button type="button" disabled={busy} onClick={() => { setComposer({ id: item.id, form: campaignToEditorForm(item) }); setEstimate(item.estimated_audience || null); }} className="campaign-action"><Pencil size={15} /> Edit</button> : null}
                {canManage ? <button type="button" disabled={busy} onClick={() => setTestPanel({ campaign: item, query: "", user: null, error: "" })} className="campaign-action text-sky-700"><FlaskConical size={15} /> Send test</button> : null}
                <button type="button" disabled={busy} onClick={() => showMetrics(item.id)} className="campaign-action"><BarChart3 size={15} /> Analytics</button>
                {canApprove && ["draft", "pending_approval"].includes(item.status) ? <button type="button" disabled={busy} onClick={() => approve(item.id)} className="campaign-action text-emerald-700"><Check size={15} /> Approve</button> : null}
                {canPublish && item.status === "approved" ? <button type="button" disabled={busy} onClick={() => setPublishPanel({ campaign: item, worldwideAcknowledged: false })} className="campaign-action border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white"><Send size={15} /> Publish</button> : null}
                {canManage && ["draft", "pending_approval", "approved", "scheduled"].includes(item.status) ? <button type="button" disabled={busy} onClick={() => cancel(item.id)} className="campaign-action text-rose-700"><X size={15} /> Cancel</button> : null}
              </div>
            </div>
            {itemMetrics ? <CampaignMetrics metrics={itemMetrics} /> : null}
          </article>;
        })}
      </div>

      {composer ? <CampaignComposer key={composer.id || "new"} busy={busy} canCritical={canCritical} editingId={composer.id} estimate={estimate} form={composer.form} onClose={() => setComposer(null)} onEstimate={estimateCampaign} onSave={saveCampaign} /> : null}
      {testPanel ? <TestDeliveryPanel state={testPanel} setState={setTestPanel} busy={busy} onSend={async () => {
        if (!testPanel.user?.user_id) return;
        setBusy(true); setError("");
        try { await sendNotificationCampaignTest(testPanel.campaign.id, testPanel.user.user_id); setTestPanel(null); }
        catch (nextError) { setTestPanel((current) => ({ ...current, error: nextError.message })); }
        finally { setBusy(false); }
      }} /> : null}
      {publishPanel ? <PublishConfirmation state={publishPanel} setState={setPublishPanel} busy={busy} onPublish={publish} /> : null}
    </div>
  );
}

function CampaignMetrics({ metrics }) {
  const rows = [
    ["Targeted", "targeted"], ["Delivered", "delivered"], ["Viewed", "displayed"], ["Unread", "unread"],
    ["Clicked", "clicked"], ["Dismissed", "dismissed"], ["CTA clicks", "ctaClicks"], ["Delivery rate", "deliveryRate", "%"], ["Click-through", "clickThroughRate", "%"],
  ];
  return <div className="mt-5 grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 dark:border-zinc-800 dark:bg-zinc-900">{rows.map(([label, key, suffix = ""]) => <div key={key} className="rounded-xl bg-white p-3 dark:bg-zinc-950"><p className="text-lg font-black">{Number((metrics[key] ?? metrics[key === "delivered" ? "created" : key]) || 0).toLocaleString()}{suffix}</p><p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</p></div>)}</div>;
}

function CampaignComposer({ busy, canCritical, editingId, estimate, form: initialForm, onClose, onEstimate, onSave }) {
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [validation, setValidation] = useState("");
  const paths = useMemo(() => buildNotificationTargetPaths(form.targeting), [form.targeting]);

  function validate(index = step) {
    if (index === 0 && !form.campaignName.trim()) return "Add an internal campaign name.";
    if (index === 1 && !paths.length) return "Choose at least one platform target.";
    if (index === 2 && form.audienceMode === "segments" && !form.segments.length) return "Choose at least one reliable audience segment.";
    if (index === 2 && form.audienceMode === "users" && !form.users.length) return "Add at least one verified KunThai ID.";
    if (index === 3 && form.locationMode === "specific" && !form.locations.length) return "Choose at least one country.";
    if (index === 3 && form.locations.some((location) => !location.entireCountry && !location.cities.length)) return "Choose at least one city for every city-targeted country.";
    if (index === 4 && form.presentation === "critical" && (!['safety', 'security', 'account', 'emergency'].includes(form.category) || form.priority !== "critical")) return "Critical Alert requires Critical priority and a safety, security, account or emergency category.";
    if (index === 5 && (!form.title.trim() || !form.body.trim())) return "Notification title and message are required.";
    if (index === 5 && form.cta.enabled && (!form.cta.label.trim() || !form.cta.destination || (["external", "profile", "urfeed_post", "swip_video", "urmall_product", "urmall_store", "urride_booking", "internal"].includes(form.cta.destination) && !form.cta.value.trim()))) return "Complete the action button label and destination details.";
    if (index === 7 && form.scheduleMode === "schedule" && !form.scheduledAt) return "Choose the scheduled delivery date and time.";
    return "";
  }

  function next() {
    const message = validate();
    setValidation(message);
    if (!message) setStep((value) => Math.min(CAMPAIGN_STEPS.length - 1, value + 1));
  }

  const canSave = form.campaignName.trim() && form.title.trim() && form.body.trim() && paths.length;
  return <div className="fixed inset-0 z-[1500] flex items-stretch bg-zinc-950/65 p-0 backdrop-blur-sm sm:p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="Notification campaign builder" className="relative mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden bg-zinc-50 shadow-2xl sm:h-[calc(100vh-2rem)] sm:rounded-[30px] dark:bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950"><Sparkles size={18} /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{editingId ? "Edit campaign" : "New campaign"}</p><h2 className="truncate text-lg font-black">{form.campaignName || "Untitled campaign"}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close campaign builder"><X size={20} /></button></header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 bg-white p-2 lg:w-64 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-4 dark:border-zinc-800 dark:bg-zinc-950" aria-label="Campaign creation steps">{CAMPAIGN_STEPS.map((item, index) => <button key={item.id} type="button" onClick={() => setStep(index)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black transition lg:w-full ${step === index ? "bg-emerald-700 text-white dark:bg-emerald-600 dark:text-white" : index < step ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}><span className="grid h-6 w-6 place-items-center rounded-full border border-current text-[10px]">{index < step ? <Check size={13} /> : index + 1}</span>{item.label}</button>)}</nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-7 lg:p-9">
          <div className="mx-auto max-w-4xl">
            <StepHeading index={step} />
            {step === 0 ? <CampaignBasics canCritical={canCritical} form={form} setForm={setForm} /> : null}
            {step === 1 ? <PlatformTargeting form={form} setForm={setForm} paths={paths} /> : null}
            {step === 2 ? <AudienceTargeting form={form} setForm={setForm} /> : null}
            {step === 3 ? <LocationTargeting form={form} setForm={setForm} /> : null}
            {step === 4 ? <PresentationSettings canCritical={canCritical} form={form} setForm={setForm} /> : null}
            {step === 5 ? <ContentAction form={form} setForm={setForm} /> : null}
            {step === 6 ? <BehaviourSettings form={form} setForm={setForm} /> : null}
            {step === 7 ? <ScheduleSettings form={form} setForm={setForm} /> : null}
            {step === 8 ? <CampaignPreview form={form} /> : null}
            {step === 9 ? <CampaignReview form={form} paths={paths} estimate={estimate} onEstimate={() => onEstimate(form)} busy={busy} /> : null}
            {validation ? <p role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{validation}</p> : null}
          </div>
        </main>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950"><button type="button" disabled={step === 0} onClick={() => { setValidation(""); setStep((value) => Math.max(0, value - 1)); }} className="campaign-action disabled:opacity-40"><ChevronLeft size={16} /> Back</button><div className="flex flex-wrap gap-2">{canSave ? <button type="button" disabled={busy} onClick={() => onSave(form, editingId)} className="campaign-action"><Inbox size={16} /> Save draft</button> : null}{step < CAMPAIGN_STEPS.length - 1 ? <button type="button" onClick={next} className="campaign-action border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white">Continue <ChevronRight size={16} /></button> : <button type="button" disabled={busy || !canSave} onClick={() => { const invalid = CAMPAIGN_STEPS.map((_, index) => validate(index)).find(Boolean); setValidation(invalid || ""); if (!invalid) onSave(form, editingId); }} className="campaign-action border-emerald-700 bg-emerald-700 text-white disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600 dark:text-white">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} Save campaign</button>}</div></footer>
    </section>
  </div>;
}

function StepHeading({ index }) {
  const descriptions = [
    "Name the campaign internally and set its operational priority.",
    "Choose exactly where in KunThai this campaign belongs.",
    "Use reliable account data or exact KunThai IDs.",
    "Target worldwide, one country, or multiple country-and-city combinations.",
    "Choose how the notification appears and how it enters and leaves.",
    "Write the user-facing message and connect an optional action.",
    "Control click behaviour, repetition, dismissal and expiration.",
    "Save a draft, prepare immediate publication, or schedule for approval.",
    "Test the visual treatment across device styles and colour modes.",
    "Verify targeting and calculate the real audience before approval.",
  ];
  return <div className="mb-7"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Step {index + 1} of {CAMPAIGN_STEPS.length}</p><h3 className="mt-2 text-3xl font-black tracking-tight">{CAMPAIGN_STEPS[index].label}</h3><p className="mt-2 text-sm font-semibold leading-6 text-zinc-500">{descriptions[index]}</p></div>;
}

function CampaignBasics({ canCritical, form, setForm }) {
  const priorities = canCritical ? CAMPAIGN_PRIORITIES : CAMPAIGN_PRIORITIES.filter(([value]) => value !== "critical");
  return <div className="grid gap-5"><Field label="Campaign name" hint="Internal administrators only"><input value={form.campaignName} onChange={(event) => setForm((current) => ({ ...current, campaignName: event.target.value }))} placeholder="UrRide motorbike operator update" className="campaign-input" /></Field><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Priority" value={form.priority} options={priorities} onChange={(priority) => setForm((current) => ({ ...current, priority }))} /><SelectField label="Category" value={form.category} options={CAMPAIGN_CATEGORIES} onChange={(category) => setForm((current) => ({ ...current, category, canDismiss: ["promotion", "marketplace"].includes(category) ? true : current.canDismiss }))} /></div><div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold leading-6 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200"><strong className="font-black">Approval stays protected.</strong> Saving creates a draft. Campaign approval and publication continue to follow KunThai’s existing role and independent-approval rules.</div></div>;
}

function PlatformTargeting({ form, setForm, paths }) {
  const targeting = form.targeting;
  const update = (patch) => setForm((current) => ({ ...current, targeting: { ...current.targeting, ...patch } }));
  return <div className="space-y-6">
    <ChoiceGrid options={PLATFORM_OPTIONS} selected={targeting.platforms} onToggle={(value) => update({ platforms: toggleValue(targeting.platforms, value, "general") })} />
    {targeting.platforms.includes("urmall") ? <TargetPanel title="UrMall destination" icon={LayoutDashboard}><ChipChoices options={URMALL_AREAS} selected={targeting.urmallAreas} onToggle={(value) => update({ urmallAreas: toggleValue(targeting.urmallAreas, value, "general") })} />{targeting.urmallAreas.some((area) => ["sellers", "seller_dashboard"].includes(area)) ? <div className="mt-4"><p className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-500">Seller business type</p><ChipChoices options={URMALL_BUSINESS_TYPES} selected={targeting.urmallBusinessTypes} onToggle={(value) => update({ urmallBusinessTypes: toggleValue(targeting.urmallBusinessTypes, value) })} /></div> : null}</TargetPanel> : null}
    {targeting.platforms.includes("urride") ? <TargetPanel title="UrRide destination" icon={CircleDot}><ChipChoices options={URRIDE_AREAS} selected={targeting.urrideAreas} onToggle={(value) => update({ urrideAreas: toggleValue(targeting.urrideAreas, value, "general") })} />{targeting.urrideAreas.includes("operator") ? <OperatorHierarchy title="Operator" value={targeting.operatorServices} onChange={(operatorServices) => update({ operatorServices })} /> : null}{targeting.urrideAreas.includes("operator_dashboard") ? <OperatorHierarchy title="Operator’s dashboard" value={targeting.operatorDashboardServices} onChange={(operatorDashboardServices) => update({ operatorDashboardServices })} /> : null}{targeting.urrideAreas.includes("company_dashboard") ? <div className="mt-4"><p className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-500">Company type</p><ChipChoices options={URRIDE_COMPANY_TYPES} selected={targeting.companyTypes} onToggle={(value) => update({ companyTypes: toggleValue(targeting.companyTypes, value) })} /></div> : null}</TargetPanel> : null}
    {paths.length ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Selected hierarchy</p><div className="mt-3 flex flex-wrap gap-2">{paths.map((path) => <span key={path} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-emerald-800 shadow-sm dark:bg-zinc-950 dark:text-emerald-300">{readableTarget(path)}</span>)}</div></div> : null}
  </div>;
}

function OperatorHierarchy({ title, value, onChange }) {
  function setServices(selected) { onChange({ ...value, selected }); }
  return <div className="mt-5 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900"><p className="text-sm font-black">{title}</p><div className="mt-3"><ChipChoices options={[["all", "General / all operators"], ["transport", "Transport"], ["delivery", "Delivery"]]} selected={value.selected} onToggle={(item) => setServices(toggleValue(value.selected, item))} /></div>{value.selected.includes("transport") ? <div className="mt-4"><p className="mb-2 text-xs font-black uppercase text-zinc-500">Transport vehicle types</p><ChipChoices options={URRIDE_TRANSPORT_TYPES} selected={value.transport} onToggle={(item) => onChange({ ...value, transport: toggleValue(value.transport, item) })} /></div> : null}{value.selected.includes("delivery") ? <div className="mt-4"><p className="mb-2 text-xs font-black uppercase text-zinc-500">Delivery vehicle types</p><ChipChoices options={URRIDE_DELIVERY_TYPES} selected={value.delivery} onToggle={(item) => onChange({ ...value, delivery: toggleValue(value.delivery, item) })} /></div> : null}</div>;
}

function AudienceTargeting({ form, setForm }) {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3">{[["everyone", "Everyone", "All users eligible for the platform and location"], ["segments", "Specific audience", "One or more reliable KunThai segments"], ["users", "KunThai IDs", "Exact accounts resolved from public KunThai IDs"]].map(([value, label, detail]) => <ChoiceCard key={value} selected={form.audienceMode === value} label={label} detail={detail} onClick={() => setForm((current) => ({ ...current, audienceMode: value }))} />)}</div>{form.audienceMode === "segments" ? <ChoiceGrid options={AUDIENCE_SEGMENTS} selected={form.segments} onToggle={(value) => setForm((current) => ({ ...current, segments: toggleValue(current.segments, value, "__none__") }))} /> : null}{form.audienceMode === "users" ? <KunThaiUserPicker users={form.users} onChange={(users) => setForm((current) => ({ ...current, users }))} /> : null}</div>;
}

function KunThaiUserPicker({ users, onChange }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function addIds() {
    const ids = [...new Set(query.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
    if (!ids.length) return;
    setBusy(true); setError("");
    try {
      const results = await Promise.all(ids.map((id) => lookupNotificationCampaignUser(id)));
      const found = results.filter(Boolean);
      if (!found.length) throw new Error("No matching KunThai IDs were found.");
      const map = new Map(users.map((user) => [user.user_id, user]));
      found.forEach((user) => map.set(user.user_id, user));
      onChange([...map.values()]); setQuery("");
      if (found.length !== ids.length) setError(`${ids.length - found.length} ID(s) could not be found.`);
    } catch (nextError) { setError(nextError.message); } finally { setBusy(false); }
  }
  return <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><label className="text-sm font-black">KunThai ID lookup</label><p className="mt-1 text-xs font-semibold text-zinc-500">Paste one or multiple KTU IDs. Delivery retains the canonical account UUID internally.</p><div className="mt-3 flex gap-2"><textarea rows={2} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="KTU-1234-5678-90AB, KTU-..." className="campaign-input min-h-12 flex-1 py-3" /><button type="button" disabled={busy || !query.trim()} onClick={addIds} className="campaign-action border-emerald-700 bg-emerald-700 text-white disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600 dark:text-white">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />} Find</button></div>{error ? <p className="mt-2 text-xs font-bold text-rose-700">{error}</p> : null}<div className="mt-4 grid gap-2 sm:grid-cols-2">{users.map((user) => <article key={user.user_id} className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-emerald-100 font-black text-emerald-700">{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : (user.display_name || "K").slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{user.display_name || "KunThai account"}</p><p className="truncate text-[11px] font-bold text-zinc-500">{user.public_id} · {[user.city, user.country].filter(Boolean).join(", ") || "Location unavailable"}</p></div><button type="button" aria-label={`Remove ${user.public_id}`} onClick={() => onChange(users.filter((item) => item.user_id !== user.user_id))} className="grid h-8 w-8 place-items-center rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800"><X size={15} /></button></article>)}</div></div>;
}

function LocationTargeting({ form, setForm }) {
  const [countryQuery, setCountryQuery] = useState("");
  const [cityDrafts, setCityDrafts] = useState({});
  const normalizedCountryQuery = countryQuery.trim().toLowerCase();
  const exactCountry = CAMPAIGN_COUNTRIES.find((country) => country.name.toLowerCase() === normalizedCountryQuery || country.iso2.toLowerCase() === normalizedCountryQuery);
  function addCountry() {
    if (!exactCountry || form.locations.some((item) => item.country === exactCountry.iso2)) return;
    setForm((current) => ({ ...current, locations: [...current.locations, { country: exactCountry.iso2, countryName: exactCountry.name, entireCountry: true, cities: [] }] })); setCountryQuery("");
  }
  function updateLocation(iso2, patch) { setForm((current) => ({ ...current, locations: current.locations.map((item) => item.country === iso2 ? { ...item, ...patch } : item) })); }
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2"><ChoiceCard selected={form.locationMode === "worldwide"} label="Worldwide / general" detail="No country restriction. This receives the strongest publish warning." onClick={() => setForm((current) => ({ ...current, locationMode: "worldwide" }))} /><ChoiceCard selected={form.locationMode === "specific"} label="Specific countries" detail="Combine one or more countries with entire-country or city targeting." onClick={() => setForm((current) => ({ ...current, locationMode: "specific" }))} /></div>{form.locationMode === "specific" ? <><div className="flex gap-2"><input list="campaign-country-options" value={countryQuery} onChange={(event) => setCountryQuery(event.target.value)} placeholder="Search a country" className="campaign-input flex-1" /><datalist id="campaign-country-options">{CAMPAIGN_COUNTRIES.map((country) => <option key={country.iso2} value={country.name}>{country.iso2}</option>)}</datalist><button type="button" onClick={addCountry} disabled={!exactCountry} className="campaign-action bg-zinc-950 text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"><Plus size={16} /> Add</button></div><div className="space-y-3">{form.locations.map((location) => { const profile = CAMPAIGN_COUNTRIES.find((country) => country.iso2 === location.country); return <article key={location.country} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center gap-3"><MapPin className="text-emerald-600" size={18} /><div className="flex-1"><h4 className="font-black">{location.countryName}</h4><p className="text-xs font-semibold text-zinc-500">{location.entireCountry ? "Entire country" : location.cities.join(" + ") || "Choose cities"}</p></div><button type="button" onClick={() => setForm((current) => ({ ...current, locations: current.locations.filter((item) => item.country !== location.country) }))}><X size={17} /></button></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => updateLocation(location.country, { entireCountry: true, cities: [] })} className={`campaign-chip ${location.entireCountry ? "campaign-chip-selected" : ""}`}>Entire country</button><button type="button" onClick={() => updateLocation(location.country, { entireCountry: false })} className={`campaign-chip ${!location.entireCountry ? "campaign-chip-selected" : ""}`}>Selected cities</button></div>{!location.entireCountry ? <><div className="mt-3 flex flex-wrap gap-2">{(profile?.cities || []).slice(0, 5).map((city) => <button type="button" key={city} onClick={() => updateLocation(location.country, { cities: toggleValue(location.cities, city, "__none__") })} className={`campaign-chip ${location.cities.includes(city) ? "campaign-chip-selected" : ""}`}>{city}</button>)}</div><div className="mt-3 flex gap-2"><input value={cityDrafts[location.country] || ""} onChange={(event) => setCityDrafts((current) => ({ ...current, [location.country]: event.target.value }))} placeholder="Search or add another city" className="campaign-input flex-1" /><button type="button" onClick={() => { const city = (cityDrafts[location.country] || "").trim(); if (city && !location.cities.includes(city)) updateLocation(location.country, { cities: [...location.cities, city] }); setCityDrafts((current) => ({ ...current, [location.country]: "" })); }} className="campaign-action">Add city</button></div></> : null}</article>; })}</div></> : null}</div>;
}

function PresentationSettings({ canCritical, form, setForm }) {
  const presentations = canCritical ? PRESENTATION_OPTIONS : PRESENTATION_OPTIONS.filter(([value]) => value !== "critical");
  return <div className="space-y-6"><ChoiceGrid options={presentations} selected={[form.presentation]} onToggle={(presentation) => setForm((current) => ({ ...current, presentation, ...(presentation === "critical" ? { priority: "critical" } : {}) }))} single />{form.presentation === "critical" ? <div className="flex gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-800"><ShieldAlert className="shrink-0" size={20} /> Critical Alert is restricted by the backend to critical safety, security, account or emergency campaigns and requires privileged approval.</div> : null}<div className="grid gap-4 sm:grid-cols-2"><SelectField label="Opening animation" value={form.openingAnimation} options={OPENING_ANIMATIONS} onChange={(openingAnimation) => setForm((current) => ({ ...current, openingAnimation }))} /><SelectField label="Closing animation" value={form.closingAnimation} options={CLOSING_ANIMATIONS} onChange={(closingAnimation) => setForm((current) => ({ ...current, closingAnimation }))} /></div><Field label="Delivery channels"><ChipChoices options={[["in_app", "In-app"], ["push", "Device push"]]} selected={form.channels} onToggle={(value) => setForm((current) => ({ ...current, channels: toggleValue(current.channels, value, "__none__") }))} /></Field><p className="text-xs font-semibold leading-5 text-zinc-500">Animations use transform, opacity and blur only, and are disabled automatically when a device requests reduced motion.</p></div>;
}

function ContentAction({ form, setForm }) {
  const needsValue = ["external", "profile", "urfeed_post", "swip_video", "urmall_product", "urmall_store", "urride_booking", "internal"].includes(form.cta.destination);
  return <div className="space-y-5"><div className="space-y-3"><SuggestedTextSelect label="Suggested notification titles" suggestions={NOTIFICATION_TITLE_SUGGESTIONS} onSelect={(title) => setForm((current) => ({ ...current, title }))} /><Field label="Notification title"><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="campaign-input" /></Field></div><div className="space-y-3"><SuggestedTextSelect label="Suggested notification messages" suggestions={NOTIFICATION_MESSAGE_SUGGESTIONS} onSelect={(body) => setForm((current) => ({ ...current, body }))} /><Field label="Notification message"><textarea rows={5} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} className="campaign-input min-h-32 py-3" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Optional media" value={form.media.kind} options={[["none", "No media"], ["icon", "Icon"], ["image", "Image"], ["gif", "GIF"], ["video_thumbnail", "Video thumbnail"], ["illustration", "KunThai illustration"]]} onChange={(kind) => setForm((current) => ({ ...current, media: { ...current.media, kind } }))} />{form.media.kind !== "none" ? <Field label="Media URL" hint="Use an approved HTTPS asset"><input type="url" value={form.media.url} onChange={(event) => setForm((current) => ({ ...current, media: { ...current.media, url: event.target.value } }))} className="campaign-input" placeholder="https://…" /></Field> : null}</div><ToggleRow label="Add action button" detail="Connect the campaign to an existing KunThai destination or approved external URL." checked={form.cta.enabled} onChange={(enabled) => setForm((current) => ({ ...current, cta: { ...current.cta, enabled } }))} />{form.cta.enabled ? <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"><Field label="Button name"><div className="flex flex-wrap gap-2">{CTA_LABEL_SUGGESTIONS.map((label) => <button type="button" key={label} onClick={() => setForm((current) => ({ ...current, cta: { ...current.cta, label } }))} className={`campaign-chip ${form.cta.label === label ? "campaign-chip-selected" : ""}`}>{label}</button>)}</div><input value={form.cta.label} onChange={(event) => setForm((current) => ({ ...current, cta: { ...current.cta, label: event.target.value } }))} className="campaign-input mt-3" placeholder="Custom button name" /></Field><SelectField label="Button destination" value={form.cta.destination} options={CTA_DESTINATIONS} onChange={(destination) => setForm((current) => ({ ...current, cta: { ...current.cta, destination, value: "" } }))} />{needsValue ? <Field label={form.cta.destination === "external" ? "HTTPS link" : form.cta.destination === "internal" ? "Registered deep link" : "Destination ID"}><input value={form.cta.value} onChange={(event) => setForm((current) => ({ ...current, cta: { ...current.cta, value: event.target.value } }))} className="campaign-input" placeholder={form.cta.destination === "external" ? "https://example.com" : "Paste the destination identifier"} /></Field> : null}</div> : null}</div>;
}

function BehaviourSettings({ form, setForm }) {
  const forcedDismiss = ["promotion", "marketplace"].includes(form.category);
  return <div className="space-y-5"><Field label="Notification click behaviour"><div className="grid gap-3 sm:grid-cols-3">{[["details", "Open notification details"], ["direct", "Go directly to destination"], ["details_then_cta", "Open first, then require CTA"]].map(([value, label]) => <ChoiceCard key={value} selected={form.clickBehaviour === value} label={label} detail="" onClick={() => setForm((current) => ({ ...current, clickBehaviour: value }))} />)}</div></Field><SelectField label="Display frequency" value={form.frequency} options={FREQUENCY_OPTIONS} onChange={(frequency) => setForm((current) => ({ ...current, frequency }))} />{form.frequency === "custom" ? <Field label="Minimum hours between presentations"><input type="number" min="1" max="720" value={form.frequencyHours} onChange={(event) => setForm((current) => ({ ...current, frequencyHours: event.target.value }))} className="campaign-input" /></Field> : null}<ToggleRow label="Can user dismiss?" detail={forcedDismiss ? "Promotional and marketplace campaigns must remain dismissible." : "Reserve non-dismissible campaigns for genuine required or critical messages."} checked={forcedDismiss ? true : form.canDismiss} disabled={forcedDismiss} onChange={(canDismiss) => setForm((current) => ({ ...current, canDismiss }))} /><SelectField label="Allow snooze" value={form.snooze} options={[["none", "No"], ["1h", "1 hour"], ["tomorrow", "Tomorrow"]]} onChange={(snooze) => setForm((current) => ({ ...current, snooze }))} /><SelectField label="Expiration" value={form.expirationPreset} options={EXPIRATION_OPTIONS} onChange={(expirationPreset) => setForm((current) => ({ ...current, expirationPreset }))} />{form.expirationPreset === "custom" ? <Field label="Custom expiration"><input type="datetime-local" value={form.customExpiration} onChange={(event) => setForm((current) => ({ ...current, customExpiration: event.target.value }))} className="campaign-input" /></Field> : null}</div>;
}

function ScheduleSettings({ form, setForm }) {
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3">{[["draft", "Save as draft", "Keep editable and do not send"], ["immediate", "Send immediately", "Ready for approval and manual publication"], ["schedule", "Schedule", "Publish after approval at a future time"]].map(([value, label, detail]) => <ChoiceCard key={value} selected={form.scheduleMode === value} label={label} detail={detail} onClick={() => setForm((current) => ({ ...current, scheduleMode: value }))} />)}</div>{form.scheduleMode === "schedule" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Date and time"><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} className="campaign-input" /></Field><Field label="Timezone"><input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} className="campaign-input" /></Field></div> : null}<div className="rounded-2xl border border-zinc-200 bg-zinc-100 p-4 opacity-80 dark:border-zinc-800 dark:bg-zinc-900"><p className="font-black">Recipient local-time delivery</p><p className="mt-1 text-sm font-semibold text-zinc-500">Architecture-ready, but not enabled. Campaigns currently use the selected administrator timezone and the existing scheduled publisher.</p></div></div>;
}

function CampaignPreview({ form }) {
  const [device, setDevice] = useState("iphone");
  const [theme, setTheme] = useState("light");
  const [replay, setReplay] = useState(0);
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><ChipChoices options={[["iphone", "iPhone"], ["android", "Android"]]} selected={[device]} onToggle={setDevice} /><ChipChoices options={[["light", "Light mode"], ["dark", "Dark mode"]]} selected={[theme]} onToggle={setTheme} /><button type="button" onClick={() => setReplay((value) => value + 1)} className="campaign-action"><Sparkles size={16} /> Replay animation</button></div><div className={`mx-auto min-h-[560px] max-w-sm rounded-[44px] border-[10px] p-4 shadow-2xl ${device === "iphone" ? "border-zinc-950" : "border-zinc-700"} ${theme === "dark" ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-950"}`}><div className="mx-auto mb-8 h-5 w-28 rounded-full bg-zinc-900" /><div className="pt-20"><PreviewCard key={replay} form={form} theme={theme} /></div></div></div>;
}

function PreviewCard({ form, theme }) {
  return <article className={`campaign-preview-enter-${form.openingAnimation} overflow-hidden rounded-[26px] border p-4 shadow-2xl backdrop-blur-xl ${theme === "dark" ? "border-white/10 bg-zinc-900/95" : "border-white bg-white/95"}`}>{form.media.kind !== "none" && form.media.url ? <img src={form.media.url} alt="" className="mb-3 h-32 w-full rounded-2xl object-cover" /> : null}<div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><BellRing size={18} /></span><div className="min-w-0 flex-1"><p className="text-sm font-black">{form.title || "Notification title"}</p><p className="mt-1 text-xs font-semibold leading-5 opacity-70">{form.body || "Your campaign message will appear here."}</p>{form.cta.enabled ? <button type="button" className="mt-3 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white">{form.cta.label || "View"}</button> : null}</div></div><p className="mt-3 text-[9px] font-black uppercase tracking-widest text-emerald-600">{titleCase(form.presentation)} · {titleCase(form.openingAnimation)}</p></article>;
}

function CampaignReview({ form, paths, estimate, onEstimate, busy }) {
  const payload = buildCampaignPayload(form);
  const worldwide = isWorldwideCampaign(payload);
  return <div className="space-y-4"><ReviewRow label="Campaign" value={form.campaignName} /><ReviewRow label="Platform" value={paths.map(readableTarget).join("; ")} /><ReviewRow label="Audience" value={form.audienceMode === "everyone" ? "Everyone eligible for these targets" : form.audienceMode === "users" ? form.users.map((user) => user.public_id).join(", ") : form.segments.map(titleCase).join(", ")} /><ReviewRow label="Location" value={form.locationMode === "worldwide" ? "Worldwide" : form.locations.map((location) => `${location.countryName} → ${location.entireCountry ? "Entire country" : location.cities.join(" + ")}`).join("; ")} /><ReviewRow label="Presentation" value={`${titleCase(form.presentation)} · ${titleCase(form.openingAnimation)} → ${titleCase(form.closingAnimation)}`} /><ReviewRow label="CTA" value={form.cta.enabled ? `${form.cta.label} → ${titleCase(form.cta.destination)}` : "No action button"} /><ReviewRow label="Schedule" value={form.scheduleMode === "schedule" ? `${formatDateTime(form.scheduledAt)} · ${form.timezone}` : titleCase(form.scheduleMode)} />{worldwide ? <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900"><Globe2 className="shrink-0" size={20} /> This is a worldwide or unrestricted-location campaign. Publication requires an additional blast-radius acknowledgement.</div> : null}<div className="rounded-2xl bg-zinc-950 p-5 text-white dark:bg-zinc-900 dark:text-white"><p className="text-xs font-black uppercase tracking-[0.16em] opacity-60">Estimated recipients</p><p className="mt-2 text-4xl font-black">{estimate === null ? "Not calculated" : Number(estimate).toLocaleString()}</p><button type="button" onClick={onEstimate} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <UsersRound size={16} />} Calculate from current data</button></div></div>;
}

function TestDeliveryPanel({ state, setState, busy, onSend }) {
  async function lookup() {
    setState((current) => ({ ...current, error: "", user: null }));
    try {
      const user = await lookupNotificationCampaignUser(state.query);
      if (!user) throw new Error("KunThai ID not found.");
      setState((current) => ({ ...current, user }));
    } catch (error) { setState((current) => ({ ...current, error: error.message })); }
  }
  return <Modal title="Send a safe test" onClose={() => setState(null)}><p className="text-sm font-semibold leading-6 text-zinc-500">This creates one clearly labelled test delivery for the selected KunThai ID. It never resolves or sends to the production audience.</p><div className="mt-4 flex gap-2"><input value={state.query} onChange={(event) => setState((current) => ({ ...current, query: event.target.value, user: null }))} placeholder="KTU-XXXX-XXXX-XXXX" className="campaign-input flex-1" /><button type="button" onClick={lookup} className="campaign-action"><Search size={16} /> Find</button></div>{state.error ? <p className="mt-2 text-sm font-bold text-rose-700">{state.error}</p> : null}{state.user ? <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900"><p className="font-black">{state.user.display_name}</p><p className="text-sm font-semibold">{state.user.public_id} · {[state.user.city, state.user.country].filter(Boolean).join(", ")}</p></div> : null}<button type="button" disabled={busy || !state.user} onClick={onSend} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-black text-white disabled:opacity-40 dark:bg-emerald-600 dark:text-white">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <FlaskConical size={17} />} Send test only</button></Modal>;
}

function PublishConfirmation({ state, setState, busy, onPublish }) {
  const item = state.campaign;
  const worldwide = (item.audience_filter?.targets || item.configuration?.targetPaths || []).includes("all") || !(item.audience_filter?.locations || []).length;
  return <Modal title="Confirm campaign publication" onClose={() => setState(null)}><div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900"><p className="text-xs font-black uppercase tracking-[0.18em]">Blast-radius check</p><p className="mt-2 text-3xl font-black">{Number(item.estimated_audience || 0).toLocaleString()} users</p><p className="mt-2 text-sm font-semibold">The backend recalculates the audience and rejects publication if this confirmation is stale.</p></div>{worldwide ? <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900"><input type="checkbox" checked={state.worldwideAcknowledged} onChange={(event) => setState((current) => ({ ...current, worldwideAcknowledged: event.target.checked }))} className="mt-1 h-5 w-5 accent-amber-700" /> I understand this campaign is worldwide or has no location restriction.</label> : null}<button type="button" disabled={busy || (worldwide && !state.worldwideAcknowledged)} onClick={onPublish} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 font-black text-white disabled:opacity-40">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />} Publish to confirmed audience</button></Modal>;
}

function Modal({ title, children, onClose }) {
  return <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-zinc-950/65 p-4 backdrop-blur-sm" role="presentation"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-2xl dark:bg-zinc-950"><div className="flex items-center gap-3"><h2 className="flex-1 text-xl font-black">{title}</h2><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button></div><div className="mt-4">{children}</div></section></div>;
}

function TargetPanel({ children, icon: Icon, title }) { return <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950"><div className="mb-4 flex items-center gap-2"><Icon size={18} className="text-emerald-600" /><h4 className="font-black">{title}</h4></div>{children}</section>; }
function Field({ children, hint, label }) { return <label className="block"><span className="mb-1.5 block text-sm font-black">{label}</span>{hint ? <span className="mb-2 block text-xs font-semibold text-zinc-500">{hint}</span> : null}{children}</label>; }
function SelectField({ label, onChange, options, value }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className="campaign-input">{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></Field>; }
function ChoiceGrid({ onToggle, options, selected, single = false }) { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{options.map(([value, label, detail = ""]) => <ChoiceCard key={value} selected={selected.includes(value)} label={label} detail={detail} onClick={() => onToggle(value, single)} />)}</div>; }
function ChoiceCard({ detail, label, onClick, selected }) { return <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900" : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"}`}><span className="flex items-center gap-2 text-sm font-black">{selected ? <Check className="text-emerald-600" size={16} /> : <CircleDot className="text-zinc-300" size={16} />}{label}</span>{detail ? <span className="mt-2 block text-xs font-semibold leading-5 text-zinc-500">{detail}</span> : null}</button>; }
function ChipChoices({ onToggle, options, selected }) { return <div className="flex flex-wrap gap-2">{options.map(([value, label]) => <button type="button" key={value} aria-pressed={selected.includes(value)} onClick={() => onToggle(value)} className={`campaign-chip ${selected.includes(value) ? "campaign-chip-selected" : ""}`}>{label}</button>)}</div>; }
function ToggleRow({ checked, detail, disabled = false, label, onChange }) { return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"><span className={`relative h-7 w-12 shrink-0 rounded-full ${checked ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} /></span><span><strong className="block text-sm font-black">{label}</strong><span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">{detail}</span></span></button>; }
function ReviewRow({ label, value }) { return <div className="grid gap-1 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-[10rem_1fr] dark:border-zinc-800 dark:bg-zinc-950"><p className="text-xs font-black uppercase tracking-wide text-zinc-400">{label}</p><p className="text-sm font-bold">{value || "Not set"}</p></div>; }
