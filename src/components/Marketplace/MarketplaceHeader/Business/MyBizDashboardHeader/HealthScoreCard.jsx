export default function HealthScoreCard({ health }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-gray-500">{health.label}</p>
          <p className="mt-1 text-3xl font-black text-gray-950">
            {health.score}%
          </p>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-900">
          {health.score}
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-emerald-500"
          style={{ width: `${health.score}%` }}
        />
      </div>

      <p className="mt-3 text-sm font-medium leading-5 text-gray-500">
        {health.nextStep}
      </p>
    </section>
  );
}
