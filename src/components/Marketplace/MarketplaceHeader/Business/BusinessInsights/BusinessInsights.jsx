import {
  BarChart3,
  Eye,
  MousePointerClick,
  Search,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

import { useSellerInsights } from "../../../../../Backend/hooks/useSellerInsights";
import { useI18n, t } from "../../../../../i18n";
import AnimatedMetricValue from "./AnimatedMetricValue";

const TONES = {
  sky: "bg-sky-500/15 text-sky-300 ring-sky-400/15",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/15",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/15",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-400/15",
};

function InsightTile({ delay = 0, detail, icon: Icon, label, tone, value }) {
  return (
    <article
      className="kt-catalog-insight-tile group relative min-h-[172px] overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_50px_rgba(2,6,23,0.18)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.075]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/[0.035] blur-2xl" aria-hidden="true" />
      <span className={`relative grid h-11 w-11 place-items-center rounded-2xl ring-1 transition-transform duration-300 group-hover:scale-105 ${TONES[tone] || TONES.sky}`}>
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <AnimatedMetricValue value={value} className="relative mt-6 block truncate text-[1.75rem] font-black leading-none text-white" />
      <p className="relative mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      {detail ? <p className="relative mt-2 truncate text-xs font-semibold text-slate-500">{detail}</p> : null}
    </article>
  );
}

function ProductJourney({ signal }) {
  const views = Number(signal?.views || 0);
  const orders = Number(signal?.orders || 0);
  const max = Math.max(1, views);
  const rows = [
    { label: t("urmall.biz.cat.views"), value: views, width: views ? 100 : 3, color: "from-sky-500 to-cyan-400" },
    { label: t("urmall.biz.cat.sales"), value: orders, width: orders ? Math.max(5, (orders / max) * 100) : 3, color: "from-emerald-500 to-teal-400" },
  ];

  return (
    <section className="kt-catalog-insight-section rounded-[24px] border border-white/10 bg-white/[0.045] p-5" style={{ animationDelay: "430ms" }}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/15">
          <TriangleAlert size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-white">{t("urmall.biz.ins.mostAbandoned")}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-slate-400">{signal?.name}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row, index) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
              <span>{row.label}</span>
              <AnimatedMetricValue value={row.value} className="font-black text-white" />
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={`kt-catalog-insight-bar h-full rounded-full bg-gradient-to-r ${row.color}`}
                style={{ "--kt-insight-width": `${row.width}%`, animationDelay: `${520 + index * 130}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
      {signal?.reason ? <p className="mt-4 rounded-xl bg-amber-400/10 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-100/80">{signal.reason}</p> : null}
    </section>
  );
}

function DiscoveryDetails({ searchTerms, trafficSources }) {
  if (!trafficSources.length && !searchTerms.length) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {trafficSources.length ? (
        <section className="kt-catalog-insight-section rounded-[24px] border border-white/10 bg-white/[0.045] p-5" style={{ animationDelay: "520ms" }}>
          <h3 className="text-sm font-black text-white">{t("urmall.biz.ins.trafficTitle")}</h3>
          <div className="mt-4 space-y-3">
            {trafficSources.slice(0, 5).map((source, index) => (
              <div key={source.source}>
                <div className="flex justify-between gap-3 text-xs font-bold text-slate-400"><span>{source.source}</span><span>{source.percent}%</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="kt-catalog-insight-bar h-full rounded-full bg-sky-400" style={{ "--kt-insight-width": `${source.percent}%`, animationDelay: `${610 + index * 80}ms` }} /></div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {searchTerms.length ? (
        <section className="kt-catalog-insight-section rounded-[24px] border border-white/10 bg-white/[0.045] p-5" style={{ animationDelay: "590ms" }}>
          <div className="flex items-center gap-2 text-white"><Search size={17} /><h3 className="text-sm font-black">{t("urmall.biz.ins.searchTitle")}</h3></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {searchTerms.slice(0, 8).map((item) => <span key={item.term} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">{item.term} · {item.count}</span>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <section className="rounded-[28px] bg-slate-950 p-4 sm:p-5" aria-busy="true">
      <div className="h-28 animate-pulse rounded-[22px] bg-white/[0.06]" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-44 animate-pulse rounded-[24px] bg-white/[0.06]" />)}
      </div>
    </section>
  );
}

export default function BusinessInsights() {
  useI18n();
  const { metrics, trafficSources, searchTerms, productSignals, loading } = useSellerInsights();

  if (loading || !metrics || !productSignals) return <InsightsSkeleton />;

  const opportunity = productSignals.mostAbandoned || {};
  const opportunityGap = Math.max(0, Number(opportunity.views || 0) - Number(opportunity.orders || 0));
  const items = [
    { icon: Eye, label: metrics.productClicks.label, value: metrics.productClicks.value, detail: metrics.productClicks.detail, tone: "sky" },
    { icon: MousePointerClick, label: metrics.conversionRate.label, value: metrics.conversionRate.value, detail: metrics.conversionRate.detail, tone: "violet" },
    { icon: UsersRound, label: metrics.returningCustomers.label, value: metrics.returningCustomers.value, detail: metrics.returningCustomers.detail, tone: "emerald" },
    { icon: TrendingUp, label: metrics.viewsTrend.label, value: metrics.viewsTrend.value, detail: metrics.viewsTrend.detail, tone: "amber" },
    { icon: BarChart3, label: t("urmall.biz.ins.mostViewed"), value: productSignals.mostViewed?.views || 0, detail: productSignals.mostViewed?.name, tone: "emerald" },
    { icon: TriangleAlert, label: t("urmall.biz.ins.mostAbandoned"), value: opportunityGap, detail: opportunity.name, tone: "amber" },
  ];

  return (
    <section className="overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#071120_0%,#0f172a_54%,#111c2f_100%)] p-4 text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)] sm:p-5">
      <header className="kt-catalog-insight-hero relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(125deg,#082f49_0%,#0f172a_52%,#064e3b_130%)] p-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-sky-400/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-sky-200 ring-1 ring-white/10"><BarChart3 size={22} /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">{t("urmall.biz.ins.kicker")}</p>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">{t("urmall.biz.ins.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-300">{t("urmall.biz.ins.subtitle")}</p>
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map((item, index) => <InsightTile key={item.label} {...item} delay={70 + index * 65} />)}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
        <section className="kt-catalog-insight-section rounded-[24px] border border-white/10 bg-white/[0.045] p-5" style={{ animationDelay: "360ms" }}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/15"><Sparkles size={18} /></span>
            <div className="min-w-0"><h3 className="text-sm font-black text-white">{t("urmall.biz.ins.mostViewed")}</h3><p className="mt-1 truncate text-xs font-semibold text-slate-400">{productSignals.mostViewed?.name}</p></div>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div><AnimatedMetricValue value={productSignals.mostViewed?.views || 0} className="text-4xl font-black text-white" /><p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t("urmall.biz.cat.views")}</p></div>
            <div className="flex h-16 items-end gap-1" aria-hidden="true">{[35, 55, 42, 76, 62, 100].map((height, index) => <span key={index} className="kt-catalog-mini-bar w-2 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ "--kt-mini-height": `${height}%`, animationDelay: `${480 + index * 70}ms` }} />)}</div>
          </div>
        </section>
        <ProductJourney signal={opportunity} />
      </div>

      <div className="mt-3"><DiscoveryDetails searchTerms={searchTerms || []} trafficSources={trafficSources || []} /></div>
    </section>
  );
}
