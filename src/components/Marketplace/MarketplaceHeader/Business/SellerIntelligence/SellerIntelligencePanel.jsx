export default function SellerIntelligencePanel({ item }) {
  const rows = item.rows || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-black text-gray-950">{item.title}</h4>
          <p className="text-sm font-semibold text-gray-500">{item.description}</p>
        </div>
        <p className="text-2xl font-black text-gray-950">{item.value}</p>
      </div>

      {rows.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-950">
                    {row.label}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                    {row.detail}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-gray-900">
                  {row.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm font-semibold text-gray-500">
          No data here yet. This section will fill in automatically as sellers receive orders, messages, reviews, payouts, and buyer activity.
        </div>
      )}
    </div>
  );
}
