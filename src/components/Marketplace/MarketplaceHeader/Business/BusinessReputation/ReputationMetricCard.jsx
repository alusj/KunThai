export default function ReputationMetricCard({ label, value, helper, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tones[tone]}`}>
        {label}
      </span>
      <p className="mt-3 text-2xl font-black text-gray-950">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold text-gray-500">{helper}</p> : null}
    </article>
  );
}
