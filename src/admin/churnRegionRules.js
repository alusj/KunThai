// Heat colour for a region tile: by churn rate, grey when no one is there.
export function regionTone(churnRate, users) {
  if (!Number(users) || churnRate === null || churnRate === undefined) return "bg-zinc-50 text-zinc-500 ring-zinc-200";
  const rate = Number(churnRate);
  if (rate < 0.1) return "bg-emerald-100 text-emerald-950 ring-emerald-200";
  if (rate < 0.2) return "bg-lime-100 text-lime-950 ring-lime-200";
  if (rate < 0.35) return "bg-amber-100 text-amber-950 ring-amber-200";
  if (rate < 0.5) return "bg-orange-200 text-orange-950 ring-orange-300";
  return "bg-red-300 text-red-950 ring-red-400";
}
