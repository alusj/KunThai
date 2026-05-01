export default function PromotionMetricCard({ label, value, helper }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-gray-950">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold text-gray-500">{helper}</p> : null}
    </div>
  );
}
