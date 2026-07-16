export default function ActivePromotionCard({ promotion }) {
  const viewPercent = promotion.viewLimit
    ? Math.min(100, Math.round((promotion.views / promotion.viewLimit) * 100))
    : 0;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-blue-700">{promotion.discountLabel}</p>
          <h4 className="mt-1 font-black text-gray-950">{promotion.name}</h4>
          <p className="mt-1 text-sm font-medium text-gray-500">{promotion.productName}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
          Ends {promotion.endsIn}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric label="Views" value={promotion.views} />
        <MiniMetric label="Credits" value={promotion.creditCost} />
        <MiniMetric label="Orders" value={promotion.orders} />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-black text-gray-500">
          <span>View cap</span>
          <span>{promotion.viewLimit ? `${promotion.views} / ${promotion.viewLimit}` : "No fixed cap"}</span>
        </div>
        {promotion.viewLimit ? (
          <div className="h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-blue-600" style={{ width: `${viewPercent}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-black uppercase text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}
