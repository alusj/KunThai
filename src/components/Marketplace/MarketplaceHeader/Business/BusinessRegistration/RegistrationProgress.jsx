const STEPS = ["Identity", "Location", "Operations", "Trust & Payout", "Review"];

export default function RegistrationProgress({ step }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-gray-950">Step {step + 1} of {STEPS.length}</p>
        <p className="text-sm font-bold text-gray-500">{STEPS[step]}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {STEPS.map((label, index) => (
          <div key={label} className="space-y-1">
            <div className={`h-2 rounded-full ${index <= step ? "bg-blue-600" : "bg-gray-100"}`} />
            <p className={`hidden text-xs font-bold sm:block ${index <= step ? "text-blue-700" : "text-gray-400"}`}>
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
