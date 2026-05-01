export default function ProfileCompletenessBar({ value }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-black text-gray-950">Profile completeness</h4>
        <span className="text-sm font-black text-gray-700">{value}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-amber-500" style={{ width: `${value}%` }} />
      </div>
      <p className="mt-2 text-sm font-medium text-gray-500">
        Add return policy and store hours to unlock stronger trust signals.
      </p>
    </section>
  );
}
