import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

import { getNotificationCampaignMetrics } from "../adminService";
import { formatDateTime } from "../adminConfig";
import { Modal, Notice } from "./campaignUi";

// Real delivery analytics for one campaign. Every figure is counted by
// admin_get_campaign_metrics from delivery rows; anything that cannot be
// measured is shown as unavailable rather than estimated.

function formatCount(value) {
  return value === null || value === undefined ? "—" : Number(value).toLocaleString();
}

function formatRate(value) {
  return value === null || value === undefined ? "Unavailable" : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function Metric({ label, value, detail }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-zinc-400">{detail}</p> : null}
    </div>
  );
}

function FunnelBar({ label, value, total }) {
  const width = total > 0 && value !== null ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-black"><span>{label}</span><span>{formatCount(value)}</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="presentation">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function CampaignAnalyticsPanel({ campaign, onClose }) {
  const [state, setState] = useState({ loading: true, metrics: null, error: "" });

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    getNotificationCampaignMetrics(campaign.id)
      .then((metrics) => setState({ loading: false, metrics, error: "" }))
      .catch((error) => setState({ loading: false, metrics: null, error: error.message || "Analytics could not be loaded." }));
  }, [campaign.id]);

  useEffect(load, [load]);

  const metrics = state.metrics;
  const delivered = Number(metrics?.delivered || 0);

  return (
    <Modal title="Campaign analytics" description={campaign.campaign_name || campaign.title} onClose={onClose} size="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-500">{campaign.sent_at ? `Sent ${formatDateTime(campaign.sent_at)}` : "Not sent yet"}{campaign.ended_at ? ` · ended ${formatDateTime(campaign.ended_at)}` : ""}</p>
          <button type="button" onClick={load} disabled={state.loading} className="campaign-action">
            {state.loading ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} Refresh
          </button>
        </div>
        {state.error ? <Notice tone="danger" icon={AlertTriangle}>{state.error}</Notice> : null}
        {metrics?.lastError ? <Notice tone="danger" icon={AlertTriangle}>Last delivery error: {metrics.lastError}</Notice> : null}
        {metrics ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Targeted" value={formatCount(metrics.targeted)} detail={metrics.queued ? `${formatCount(metrics.queued)} queued` : ""} />
              <Metric label="Delivered" value={formatCount(metrics.delivered)} detail="In-app deliveries" />
              <Metric label="Failed" value={formatCount(metrics.failed)} />
              <Metric label="Pending" value={formatCount(metrics.pending)} detail="Not seen yet" />
              <Metric label="Viewed" value={formatCount(metrics.viewed)} detail={formatRate(metrics.viewRate)} />
              <Metric label="Clicked" value={formatCount(metrics.clicked)} detail={`${formatRate(metrics.clickRate)} of viewed`} />
              <Metric label="Dismissed" value={formatCount(metrics.dismissed)} detail={`${formatRate(metrics.dismissRate)} of viewed`} />
              <Metric label="Read" value={formatCount(metrics.inboxRead)} detail={formatRate(metrics.readRate)} />
            </div>
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" aria-label="Delivery funnel">
              <FunnelBar label="Delivered" value={metrics.delivered} total={delivered} />
              <FunnelBar label="Viewed" value={metrics.viewed} total={delivered} />
              <FunnelBar label="Clicked" value={metrics.clicked} total={delivered} />
              <FunnelBar label="Button / action used" value={metrics.ctaClicks} total={delivered} />
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="On-screen presentations" value={metrics.presented === null ? "Not used" : formatCount(metrics.presented)} detail={metrics.presented === null ? "Inbox-only campaign" : "People who saw the card/sheet/banner"} />
              <Metric
                label="Device push"
                value={metrics.pushSent === null ? "Not used" : formatCount(metrics.pushSent)}
                detail={metrics.pushSent === null ? "Push was not selected" : `${formatCount(metrics.pushFailures)} failed attempts`}
              />
            </div>
            <p className="text-xs font-semibold leading-5 text-zinc-500">
              Viewed = shown on screen or listed in an open inbox. Clicked = tapped in any presentation or inbox. Read = opened or acted on. Test sends are excluded.
            </p>
          </>
        ) : state.loading ? (
          <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-emerald-600" size={28} /></div>
        ) : null}
      </div>
    </Modal>
  );
}
