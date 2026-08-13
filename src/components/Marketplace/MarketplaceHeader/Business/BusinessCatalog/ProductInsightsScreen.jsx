import {
  BarChart3,
  Box,
  Eye,
  Megaphone,
  MousePointerClick,
  PackageCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchSellerProductInsights } from "../../../../../Backend/services/marketplace/sellerInsightService";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";
import AnimatedMetricValue from "../BusinessInsights/AnimatedMetricValue";
import { t as i18nText } from "../../../../../i18n/index";

const TONES = {
  sky: "bg-sky-500/15 text-sky-300 ring-sky-400/20",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/20",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/20",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-400/20",
};

function StatCard({ delay, detail, icon: Icon, label, tone, value }) {
  return (
    <article className="kt-catalog-insight-tile group min-h-[164px] rounded-[24px] border border-white/10 bg-white/[0.055] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.075]" style={{ animationDelay: `${delay}ms` }}>
      <span className={`grid h-11 w-11 place-items-center rounded-2xl ring-1 transition-transform duration-300 group-hover:scale-105 ${TONES[tone] || TONES.sky}`}><Icon size={20} /></span>
      <AnimatedMetricValue value={value} className="mt-5 block truncate text-[1.7rem] font-black leading-none text-white" />
      <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      {detail ? <p className="mt-2 truncate text-xs font-semibold text-slate-500">{detail}</p> : null}
    </article>
  );
}

function ProductJourney({ insights }) {
  const max = Math.max(1, insights.views);
  const rows = [
    { label: t("urmall.biz.cat.views"), value: insights.views, width: insights.views ? 100 : 3, color: "from-sky-500 to-cyan-400" },
    { label: t("urmall.biz.cat.sales"), value: insights.sales, width: insights.sales ? Math.max(5, (insights.sales / max) * 100) : 3, color: "from-emerald-500 to-teal-400" },
  ];

  return (
    <section className="kt-catalog-insight-section rounded-[24px] border border-white/10 bg-white/[0.045] p-5" style={{ animationDelay: "420ms" }}>
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20"><MousePointerClick size={18} /></span><div><h3 className="text-sm font-black text-white">{i18nText("ui.literals.kc27606a9d54a")}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{i18nText("ui.literals.k44569dac1010")}</p></div></div>
      <div className="mt-5 space-y-4">
        {rows.map((row, index) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-xs font-bold text-slate-400"><span>{row.label}</span><AnimatedMetricValue value={row.value} className="font-black text-white" /></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.07]"><div className={`kt-catalog-insight-bar h-full rounded-full bg-gradient-to-r ${row.color}`} style={{ "--kt-insight-width": `${row.width}%`, animationDelay: `${520 + index * 140}ms` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatPromotionDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function PromotionSnapshot({ insights }) {
  const promotion = insights.activePromotion || insights.latestPromotion;
  if (!promotion) {
    return (
      <section className="kt-catalog-insight-section rounded-[24px] border border-dashed border-white/15 bg-white/[0.035] p-5" style={{ animationDelay: "500ms" }}>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/15 text-violet-300"><Megaphone size={18} /></span>
        <h3 className="mt-4 text-sm font-black text-white">{i18nText("ui.literals.ka1caff114df1")}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{i18nText("ui.literals.k24fecaeb76ce")}</p>
      </section>
    );
  }

  const active = Boolean(insights.activePromotion);
  const start = new Date(promotion.starts_at || promotion.created_at || Date.now()).getTime();
  const end = promotion.ends_at ? new Date(promotion.ends_at).getTime() : 0;
  const elapsed = end > start ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;

  return (
    <section className="kt-catalog-insight-section rounded-[24px] border border-white/10 bg-white/[0.045] p-5" style={{ animationDelay: "500ms" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20"><Megaphone size={18} /></span><div><h3 className="text-sm font-black text-white">{i18nText("ui.literals.ka1caff114df1")}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{promotion.name}</p></div></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${active ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-400/15 text-slate-300"}`}>{active ? i18nText("ui.literals.ka733b809d2f1") : i18nText("ui.literals.k90303d8df23e")}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <MiniMetric label={t("urmall.biz.promo.views")} value={insights.promotionViews} />
        <MiniMetric label={t("urmall.biz.promo.orders")} value={insights.promotionOrders} />
        <MiniMetric label={t("urmall.biz.promo.revenue")} value={formatCurrency(insights.promotionRevenue)} />
      </div>
      {end ? <><div className="mt-5 flex items-center justify-between gap-3 text-xs font-bold text-slate-400"><span>{active ? i18nText("ui.literals.k6f7541418948") : i18nText("ui.literals.k4c3caed411fd")}</span><span>{formatPromotionDate(promotion.ends_at)}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="kt-catalog-insight-bar h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400" style={{ "--kt-insight-width": `${active ? elapsed : 100}%`, animationDelay: "660ms" }} /></div></> : null}
    </section>
  );
}

function MiniMetric({ label, value }) {
  return <div className="rounded-xl bg-white/[0.05] px-2 py-3"><AnimatedMetricValue value={value} className="block truncate text-sm font-black text-white" /><span className="mt-1 block truncate text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</span></div>;
}

function InsightsSkeleton() {
  return <div className="rounded-[28px] bg-slate-950 p-4"><div className="h-32 animate-pulse rounded-[24px] bg-white/[0.06]" /><div className="mt-3 grid grid-cols-2 gap-3">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-40 animate-pulse rounded-[24px] bg-white/[0.06]" />)}</div></div>;
}

export default function ProductInsightsScreen({ product }) {
  useI18n();
  const fallback = useMemo(() => ({
    product,
    views: Number(product?.views || 0),
    sales: Number(product?.sales || 0),
    revenue: Number(product?.revenue || 0),
    stock: Number(product?.stock || 0),
    conversionRate: Number(product?.views || 0) ? (Number(product?.sales || 0) / Number(product.views)) * 100 : 0,
    promotionViews: 0,
    promotionOrders: 0,
    promotionRevenue: 0,
    promotionCount: 0,
    activePromotion: null,
    latestPromotion: null,
  }), [product]);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    let active = true;
    setInsights(null);
    fetchSellerProductInsights(product)
      .then((next) => { if (active) setInsights(next || fallback); })
      .catch(() => { if (active) setInsights(fallback); });
    return () => { active = false; };
  }, [fallback, product]);

  if (!insights) return <InsightsSkeleton />;

  const data = insights.product || product;
  const items = [
    { icon: Eye, label: t("urmall.biz.cat.views"), value: insights.views, detail: i18nText("ui.literals.k849391702b26"), tone: "sky" },
    { icon: ShoppingBag, label: t("urmall.biz.cat.sales"), value: insights.sales, detail: i18nText("ui.literals.k677ecab36a26"), tone: "emerald" },
    { icon: MousePointerClick, label: i18nText("ui.literals.k9151f8433f79"), value: `${insights.conversionRate.toFixed(1)}%`, detail: i18nText("ui.literals.k32215a4d6b6d"), tone: "violet" },
    { icon: Wallet, label: t("urmall.biz.cat.revenue"), value: formatCurrency(insights.revenue), detail: i18nText("ui.literals.k3218800d20f6"), tone: "amber" },
    { icon: Box, label: t("urmall.biz.cat.stock"), value: insights.stock, detail: i18nText("ui.literals.k392934c6543d"), tone: "sky" },
    { icon: PackageCheck, label: i18nText("ui.literals.k086e09b4b6b7"), value: insights.promotionCount, detail: i18nText("ui.literals.k536dd1cb5635"), tone: "violet" },
  ];

  return (
    <section className="overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#071120_0%,#0f172a_54%,#111c2f_100%)] p-4 text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)] sm:p-5">
      <header className="kt-catalog-insight-hero relative overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(125deg,#082f49_0%,#0f172a_52%,#312e81_130%)] p-5">
        <div className="flex items-center gap-4">
          {data?.mainImageUrl ? <img src={data.mainImageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/10 text-sky-200"><BarChart3 size={25} /></span>}
          <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">{i18nText("ui.literals.k5f45a975ee2e")}</p><h2 className="mt-1 truncate text-xl font-black">{data?.name}</h2><p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Sparkles size={14} /> {i18nText("ui.literals.kbfce985e839a")}</p></div>
        </div>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{items.map((item, index) => <StatCard key={item.label} {...item} delay={70 + index * 65} />)}</div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2"><ProductJourney insights={insights} /><PromotionSnapshot insights={insights} /></div>
    </section>
  );
}
