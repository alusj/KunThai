export default function InsightMetricCard({ label, value, detail }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-gray-950">{value}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">{detail}</p>
    </article>
  );
}
