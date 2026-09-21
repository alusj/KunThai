import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

import { getNotificationCampaignMetrics } from "../adminService";
import { formatDateTime } from "../adminConfig";
import { Modal, Notice } from "./campaignUi";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

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
  useUiLocale();
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-zinc-500">{translateUi(label)}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-zinc-400">{translateUi(detail)}</p> : null}
    </div>
  );
}

function FunnelBar({ label, value, total }) {
  useUiLocale();
  const width = total > 0 && value !== null ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-black"><span>{translateUi(label)}</span><span>{formatCount(value)}</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="presentation">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function CampaignAnalyticsPanel({ campaign, onClose }) {
  useUiLocale();
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
    <Modal title={i18nText("ui.literals.k1774b6ac6809")} description={campaign.campaign_name || campaign.title} onClose={onClose} size="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-500">{campaign.sent_at ? i18nText("ui.literals.k4d58b201bc1c", { value0: formatDateTime(campaign.sent_at) }) : i18nText("ui.literals.k890dff7d7dbf")}{campaign.ended_at ? i18nText("ui.literals.k4fcacd912aba", { value0: formatDateTime(campaign.ended_at) }) : ""}</p>
          <button type="button" onClick={load} disabled={state.loading} className="campaign-action">
            {state.loading ? <LoaderCircle className="animate-spin" size={15} /> : <RefreshCw size={15} />} {i18nText("ui.literals.k56e3badc4e6c")}
          </button>
        </div>
        {state.error ? <Notice tone="danger" icon={AlertTriangle}>{translateUi(state.error)}</Notice> : null}
        {metrics?.lastError ? <Notice tone="danger" icon={AlertTriangle}>{i18nText("ui.literals.k8804da827d06")} {metrics.lastError}</Notice> : null}
        {metrics ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={i18nText("ui.literals.k312e19347c72")} value={formatCount(metrics.targeted)} detail={metrics.queued ? i18nText("ui.literals.k7c5e3c6f3f5d", { value0: formatCount(metrics.queued) }) : ""} />
              <Metric label={i18nText("ui.literals.keea956cde875")} value={formatCount(metrics.delivered)} detail={i18nText("ui.literals.k68c2731a09f3")} />
              <Metric label={i18nText("ui.literals.k09fef5d8d9a3")} value={formatCount(metrics.failed)} />
              <Metric label={i18nText("ui.literals.k96f608c16cef")} value={formatCount(metrics.pending)} detail={i18nText("ui.literals.k7897874353b7")} />
              <Metric label={i18nText("ui.literals.kf35756226718")} value={formatCount(metrics.viewed)} detail={formatRate(metrics.viewRate)} />
              <Metric label={i18nText("ui.literals.k4561ed926598")} value={formatCount(metrics.clicked)} detail={i18nText("ui.literals.kdda57ca1de14", { value0: formatRate(metrics.clickRate) })} />
              <Metric label={i18nText("ui.literals.ke8db5f4582e5")} value={formatCount(metrics.dismissed)} detail={i18nText("ui.literals.kdda57ca1de14", { value0: formatRate(metrics.dismissRate) })} />
              <Metric label={i18nText("ui.literals.k852b438f91ad")} value={formatCount(metrics.inboxRead)} detail={formatRate(metrics.readRate)} />
            </div>
            <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" aria-label={i18nText("ui.literals.kde2f6d27f121")}>
              <FunnelBar label={i18nText("ui.literals.keea956cde875")} value={metrics.delivered} total={delivered} />
              <FunnelBar label={i18nText("ui.literals.kf35756226718")} value={metrics.viewed} total={delivered} />
              <FunnelBar label={i18nText("ui.literals.k4561ed926598")} value={metrics.clicked} total={delivered} />
              <FunnelBar label={i18nText("ui.literals.k0b1c207968e9")} value={metrics.ctaClicks} total={delivered} />
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label={i18nText("ui.literals.k5a1f2d6621e5")} value={metrics.presented === null ? "Not used" : formatCount(metrics.presented)} detail={metrics.presented === null ? i18nText("ui.literals.kd80c0532bacf") : i18nText("ui.literals.ka08da1b8f2e1")} />
              <Metric
                label={i18nText("ui.literals.kd2c40a13f571")}
                value={metrics.pushSent === null ? "Not used" : formatCount(metrics.pushSent)}
                detail={metrics.pushSent === null ? i18nText("ui.literals.k3886756d580d") : i18nText("ui.literals.kee47ffbe9cba", { value0: formatCount(metrics.pushFailures) })}
              />
            </div>
            <p className="text-xs font-semibold leading-5 text-zinc-500">
              {i18nText("ui.literals.k766fd285162b")}
            </p>
          </>
        ) : state.loading ? (
          <div className="grid min-h-40 place-items-center"><LoaderCircle className="animate-spin text-emerald-600" size={28} /></div>
        ) : null}
      </div>
    </Modal>
  );
}
