export default function ToggleRow({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left"
    >
      <span>
        <span className="block font-black text-gray-950">{label}</span>
        {description ? <span className="mt-1 block text-sm font-medium text-gray-500">{description}</span> : null}
      </span>
      <span className={`h-6 w-11 rounded-full p-1 transition ${checked ? "bg-blue-600" : "bg-gray-200"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}
