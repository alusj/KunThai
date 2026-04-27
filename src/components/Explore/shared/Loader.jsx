export default function Loader({ label = "Loading..." }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
      <span>{label}</span>
    </div>
  );
}
