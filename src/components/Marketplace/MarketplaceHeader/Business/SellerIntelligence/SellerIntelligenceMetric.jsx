import AnimatedMetricValue from "../BusinessInsights/AnimatedMetricValue";

export default function SellerIntelligenceMetric({
  icon: Icon,
  label,
  value,
  tone = "gray",
  active,
  delayMs = 0,
  onClick,
}) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-violet-50 text-violet-700",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "kt-intelligence-metric group relative min-w-[178px] flex-1 overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all duration-300",
        active
          ? "-translate-y-0.5 border-slate-950 shadow-lg shadow-slate-950/10"
          : "border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:bg-gray-50 hover:shadow-md",
      ].join(" ")}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {active ? <span className="kt-intelligence-active-glow pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-sky-50/70" aria-hidden="true" /> : null}
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-500">{label}</p>
        <span className={`kt-intelligence-icon flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 ${active ? "kt-intelligence-icon-active" : ""} ${tones[tone]}`}>
          <Icon size={18} strokeWidth={2.3} />
        </span>
      </div>
      <AnimatedMetricValue value={value} className="relative mt-3 block truncate text-2xl font-black text-gray-950" />
      <span className={`relative mt-3 block h-1 overflow-hidden rounded-full bg-gray-100 transition-opacity ${active ? "opacity-100" : "opacity-0"}`} aria-hidden="true">
        <span className="kt-intelligence-progress block h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" />
      </span>
    </button>
  );
}
