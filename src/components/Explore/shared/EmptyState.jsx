export default function EmptyState({ title = "Nothing here yet", message = "Check back later." }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
    </div>
  );
}
