import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, LoaderCircle, Monitor, Play, Search, Smartphone, Square } from "lucide-react";

import CampaignPresentation from "../../components/shared/campaigns/CampaignPresentation";
import {
  CAMPAIGN_INBOXES,
  CAMPAIGN_SCREENS,
  campaignContentFromRow,
  presentationIsInApp,
  resolvePresentationSettings,
} from "../../Backend/services/campaigns/campaignModel";
import { buildCampaignPayload } from "../notificationCampaignConfig";
import { checkNotificationCampaignTestRecipient, lookupNotificationCampaignUser, sendNotificationCampaignTest } from "../adminService";
import { Notice } from "./campaignUi";

const SCREEN_BACKDROPS = {
  any: ["KunThai", "bg-gradient-to-b from-emerald-50 to-white"],
  explore: ["Explore · UrFeed", "bg-gradient-to-b from-sky-50 to-white"],
  urmall: ["UrMall", "bg-gradient-to-b from-amber-50 to-white"],
  "urmall.buyer": ["UrMall · Browse", "bg-gradient-to-b from-amber-50 to-white"],
  "urmall.seller": ["Seller dashboard", "bg-gradient-to-b from-orange-50 to-white"],
  urride: ["UrRide", "bg-gradient-to-b from-emerald-50 to-white"],
  "urride.passenger": ["UrRide · Passenger", "bg-gradient-to-b from-emerald-50 to-white"],
  "urride.operator": ["Operator dashboard", "bg-gradient-to-b from-green-50 to-white"],
  "urride.company": ["Company dashboard", "bg-gradient-to-b from-blue-50 to-white"],
};

/** A delivered row built from the unsaved form, so the preview uses the real renderer. */
function previewRow(form) {
  const payload = buildCampaignPayload(form);
  return {
    id: "preview",
    title: payload.title,
    body: payload.body,
    sector: payload.sector,
    presentation: payload.presentation,
    action_target: payload.actionTarget,
    action_data: payload.actionData,
    display_config: payload.configuration,
  };
}

function PreviewFrame({ device, screen, bottomTabs, children }) {
  const [label, backdrop] = SCREEN_BACKDROPS[screen] || SCREEN_BACKDROPS.any;
  const phone = device === "phone";
  return (
    <div className={`relative mx-auto w-full overflow-hidden border-zinc-900 bg-white shadow-2xl ${phone ? "aspect-[9/17] max-w-[340px] rounded-[40px] border-[10px]" : "aspect-[16/10] max-w-[760px] rounded-2xl border-[6px]"}`}>
      <div aria-hidden="true" className={`absolute inset-0 ${backdrop}`}>
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-xs font-black text-zinc-700">{label}</span>
          <span className="h-6 w-6 rounded-full bg-zinc-200" />
        </div>
        <div className="mt-4 space-y-3 px-4">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-2xl bg-white/80 ring-1 ring-zinc-100" />)}
        </div>
        {bottomTabs ? <div className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-around border-t border-zinc-100 bg-white">{[0, 1, 2].map((item) => <span key={item} className="h-6 w-6 rounded-lg bg-zinc-200" />)}</div> : null}
      </div>
      {/* Contained presentations use absolute positioning inside this frame. */}
      <div className="absolute inset-0 [transform:translateZ(0)]">{children}</div>
    </div>
  );
}

export default function CampaignPreviewStep({ form, canTest, ensureSaved, busy }) {
  const [device, setDevice] = useState("phone");
  const [phase, setPhase] = useState({ key: 0, leaving: false, closed: false });
  const row = useMemo(() => previewRow(form), [form]);
  const settings = useMemo(() => resolvePresentationSettings(row.display_config, row.presentation), [row]);
  const content = campaignContentFromRow(row);
  const inApp = presentationIsInApp(row.presentation);
  const screen = row.display_config.presentation.screen || "any";
  const bottomTabs = ["any", "explore", "urmall", "urmall.buyer", "urride", "urride.passenger"].includes(screen);

  useEffect(() => {
    setPhase((current) => ({ key: current.key + 1, leaving: false, closed: false }));
  }, [settings.type, settings.openingAnimation, settings.position]);

  function replay() {
    setPhase((current) => ({ key: current.key + 1, leaving: false, closed: false }));
  }

  function close() {
    setPhase((current) => ({ ...current, leaving: true }));
    const duration = settings.closingAnimation === "none" ? 0 : settings.animationDurationMs;
    window.setTimeout(() => setPhase((current) => ({ ...current, closed: true })), duration);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Preview device" className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
          {[["phone", "Phone", Smartphone], ["desktop", "Desktop", Monitor]].map(([value, label, Icon]) => (
            <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${device === value ? "bg-emerald-700 text-white" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {inApp ? (
          <>
            <button type="button" onClick={replay} className="campaign-action"><Play size={15} /> Play opening</button>
            <button type="button" onClick={close} disabled={phase.leaving} className="campaign-action"><Square size={15} /> Play closing</button>
          </>
        ) : null}
      </div>

      <PreviewFrame device={device} screen={inApp ? screen : "any"} bottomTabs={inApp ? bottomTabs : true}>
        {inApp ? (
          phase.closed ? null : (
            <CampaignPresentation
              key={`${phase.key}-${device}`}
              contained
              content={content}
              settings={settings}
              leaving={phase.leaving}
              bottomOffset={bottomTabs}
              onAction={close}
              onDismiss={close}
            />
          )
        ) : (
          <div className="absolute inset-x-3 top-12 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-zinc-200">
            <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{CAMPAIGN_INBOXES[form.audience.platform ? row.display_config.inbox : "explore"] || "Inbox"}</p>
            <div className="mt-2 rounded-xl border border-emerald-100 p-3">
              <p className="text-sm font-black">{content.title || "Notification title"}</p>
              <p className="mt-1 line-clamp-3 text-xs font-semibold text-zinc-600">{content.body || "Your message appears here."}</p>
              {content.hasAction ? <span className="mt-2 inline-block rounded-lg bg-zinc-950 px-2.5 py-1.5 text-[11px] font-black text-white">{content.actionLabel}</span> : null}
            </div>
          </div>
        )}
      </PreviewFrame>
      <p className="text-center text-xs font-semibold text-zinc-500">
        {inApp ? `Shown on: ${CAMPAIGN_SCREENS[screen]?.label || "KunThai"}` : "Inbox only"} · The preview uses the same component KunThai renders, in your admin theme; people see it in their own light or dark theme. Use a test send to check the real interface.
      </p>

      <TestSendPanel form={form} canTest={canTest} ensureSaved={ensureSaved} busy={busy} />
    </div>
  );
}

function TestSendPanel({ form, canTest, ensureSaved, busy }) {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "", match: null });

  if (!canTest) return <Notice icon={FlaskConical}>You do not have permission to send campaign tests.</Notice>;

  async function lookup() {
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
    if (!user?.user_id) return;
    setState({ status: "sending", message: "", match: null });
    try {
      const campaignId = await ensureSaved();
      if (!campaignId) throw new Error("Fix the highlighted steps, then try the test again.");
      const [match] = await Promise.all([
        checkNotificationCampaignTestRecipient(campaignId, user.user_id).catch(() => null),
        sendNotificationCampaignTest(campaignId, user.user_id),
      ]);
      setState({ status: "sent", message: "", match });
    } catch (error) {
      setState({ status: "error", message: error.message || "The test could not be sent.", match: null });
    }
  }

  const screen = buildCampaignPayload(form).configuration.presentation.screen;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950" aria-labelledby="campaign-test-heading">
      <div>
        <h4 id="campaign-test-heading" className="flex items-center gap-2 font-black"><FlaskConical size={18} className="text-sky-700" /> Send a real test</h4>
        <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">
          Saves the draft, then delivers this exact campaign to one KunThai account through the normal delivery pipeline, marked [TEST] and removed after 24 hours. It never goes to the real audience and is not counted in analytics.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={query} onChange={(event) => { setQuery(event.target.value); setUser(null); }} placeholder="KTU-XXXX-XXXX-XXXX" className="campaign-input min-w-0 flex-1" aria-label="Test account KunThai ID" />
        <button type="button" onClick={lookup} disabled={!query.trim() || state.status === "looking"} className="campaign-action shrink-0">
          {state.status === "looking" ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />} Find account
        </button>
      </div>
      {user ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-zinc-50 p-3 sm:flex-row sm:items-center dark:bg-zinc-900">
          <div className="min-w-0 flex-1">
            <p className="truncate font-black">{user.display_name}</p>
            <p className="truncate text-xs font-bold text-zinc-500">{user.public_id}{user.city || user.country ? ` · ${[user.city, user.country].filter(Boolean).join(", ")}` : ""}</p>
          </div>
          <button type="button" onClick={send} disabled={busy || state.status === "sending"} className="campaign-action border-sky-700 bg-sky-700 text-white hover:bg-sky-800">
            {state.status === "sending" ? <LoaderCircle className="animate-spin" size={16} /> : <FlaskConical size={16} />} Send test
          </button>
        </div>
      ) : null}
      {state.status === "error" ? <Notice tone="danger" icon={AlertTriangle}>{state.message}</Notice> : null}
      {state.status === "sent" ? (
        <Notice tone="success" icon={CheckCircle2}>
          <p className="font-black">Test delivered to {user?.public_id}.</p>
          <p>
            Sign in to KunThai as that account and open {screen ? CAMPAIGN_SCREENS[screen]?.label : "the matching notification inbox"}.
            {state.match && (!state.match.matchesAudience || !state.match.matchesLocation)
              ? " Note: this account is not in the campaign's real audience, so it may not have access to that screen."
              : ""}
          </p>
        </Notice>
      ) : null}
    </section>
  );
}
