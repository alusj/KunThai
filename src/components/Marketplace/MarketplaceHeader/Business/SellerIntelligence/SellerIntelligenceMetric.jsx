export default function SellerIntelligenceMetric({
  icon: Icon,
  label,
  value,
  tone = "gray",
  active,
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
      className={[
        "min-w-[178px] flex-1 rounded-lg border bg-white p-4 text-left transition",
        active
          ? "border-gray-950 shadow-sm"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={18} strokeWidth={2.3} />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-black text-gray-950">{value}</p>
    </button>
  );
}
