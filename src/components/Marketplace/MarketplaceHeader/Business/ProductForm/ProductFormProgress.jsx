const STEPS = ["Basics", "Media", "Pricing", "Publish"];

export default function ProductFormProgress({ step }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black text-gray-950">Step {step + 1} of {STEPS.length}</p>
        <p className="text-sm font-bold text-gray-500">{STEPS[step]}</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((item, index) => (
          <div key={item} className={`h-2 rounded-full ${index <= step ? "bg-blue-600" : "bg-gray-100"}`} />
        ))}
      </div>
    </div>
  );
}
