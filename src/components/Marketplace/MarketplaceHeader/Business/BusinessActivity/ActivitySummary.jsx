export default function ActivitySummary({ summary }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <SummaryItem label="Total" value={summary.total} />
      <SummaryItem label="Action" value={summary.needsAction} />
      <SummaryItem label="Warnings" value={summary.warnings} />
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-black uppercase text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-black text-gray-950">{value}</p>
    </div>
  );
}
