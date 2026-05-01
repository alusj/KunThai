export default function TrafficSourceItem({ source }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-700">{source.source}</p>
        <p className="text-sm font-black text-gray-950">{source.percent}%</p>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-blue-600"
          style={{ width: `${source.percent}%` }}
        />
      </div>
    </div>
  );
}
