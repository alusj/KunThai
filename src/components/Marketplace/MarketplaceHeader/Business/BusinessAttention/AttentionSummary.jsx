export default function AttentionSummary({ summary }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SummaryPill label="Urgent" value={summary.high} tone="text-red-700 bg-red-50" />
      <SummaryPill label="Today" value={summary.medium} tone="text-amber-700 bg-amber-50" />
      <SummaryPill label="Watching" value={summary.low} tone="text-gray-600 bg-gray-100" />
    </div>
  );
}

function SummaryPill({ label, value, tone }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <p className="text-xs font-black uppercase">{label}</p>
      <p className="text-xl font-black">{value}</p>
    </div>
  );
}
