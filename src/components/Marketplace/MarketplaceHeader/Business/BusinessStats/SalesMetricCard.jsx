export default function SalesMetricCard({ icon: Icon, label, value, helper, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-violet-50 text-violet-700",
  };

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-gray-950">{value}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={21} strokeWidth={2.3} />
        </span>
      </div>
      {helper ? (
        <p className="mt-3 text-sm font-medium text-gray-500">{helper}</p>
      ) : null}
    </article>
  );
}
