import { LoaderCircle, TrendingDown, TrendingUp } from "lucide-react";

import { barWidth, formatCount, formatMoneyList, formatPercent } from "../churnAdminRules.js";
import { tx } from "../churnText.js";

// Shared pieces of the admin Churn intelligence screens.



export function Card({ title, note, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-zinc-200 bg-white p-4 shadow-sm ${className}`}>
      {title ? <h2 className="text-sm font-black text-zinc-950">{title}</h2> : null}
      {note ? <p className="mt-1 text-xs font-semibold text-zinc-500">{note}</p> : null}
      <div className={title || note ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, detail, tone = "zinc", icon: Icon, compact = false }) {
  const tones = {
    zinc: "border-zinc-200 bg-white text-zinc-950",
    red: "border-red-200 bg-red-50 text-red-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    sky: "border-sky-200 bg-sky-50 text-sky-950",
  };
  return (
    <div className={`min-h-28 min-w-0 rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase opacity-65">{label}</p>
        {Icon ? <Icon size={18} className="shrink-0 opacity-60" /> : null}
      </div>
      <div className={`mt-3 font-black ${compact ? "whitespace-nowrap text-base leading-6 sm:text-lg" : "break-words text-2xl sm:text-3xl"}`}>{value}</div>
      {detail ? <p className="mt-1 text-xs font-semibold opacity-70">{detail}</p> : null}
    </div>
  );
}

export function Bar({ value, max, tone = "bg-emerald-600" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${barWidth(value, max)}%` }} />
    </div>
  );
}

export function BarList({ rows, locale, tone }) {
  const max = Math.max(0, ...rows.map((row) => Number(row.value) || 0));
  if (!rows.length) return <p className="text-sm font-semibold text-zinc-500">{tx("emptyList")}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-xs font-bold text-zinc-700">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-zinc-950">{row.display ?? formatCount(row.value, locale)}</span>
          </div>
          <div className="mt-1"><Bar value={row.value} max={max} tone={row.tone || tone} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Growth({ value, locale }) {
  if (value === null || value === undefined) return <span className="text-zinc-400">—</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-black ${up ? "text-emerald-700" : "text-red-700"}`}>
      <Icon size={13} />{up ? "+" : ""}{formatPercent(value, locale)}
    </span>
  );
}

export function Provisional() {
  return <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-800">{tx("provisionalBadge")}</span>;
}

export function Money({ list, locale }) {
  const lines = formatMoneyList(list, locale);
  if (!lines.length) return <span>{tx("noRevenue")}</span>;
  return <span className="flex flex-col gap-0.5">{lines.map((line) => <span key={line}>{line}</span>)}</span>;
}

export function TableShell({ head, children }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[34rem] text-left text-xs">
        <thead><tr className="border-b border-zinc-200 text-[11px] font-black uppercase text-zinc-500">{head.map((cell, index) => <th key={index} className={`py-2 pr-3 ${index ? "text-right" : ""}`}>{cell}</th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-100 font-semibold text-zinc-700">{children}</tbody>
      </table>
    </div>
  );
}

export function Loading() {
  return <div className="flex items-center gap-2 py-10 text-sm font-bold text-zinc-500"><LoaderCircle className="animate-spin text-emerald-700" size={18} />{tx("loading")}</div>;
}

export function ErrorNote({ message }) {
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message}</div>;
}

