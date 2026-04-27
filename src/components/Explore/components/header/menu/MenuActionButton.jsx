export default function MenuActionButton({ icon: Icon, label, tone = "default", onClick }) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600 hover:bg-rose-50"
      : tone === "strong"
        ? "text-slate-950 hover:bg-slate-100"
        : "text-slate-700 hover:bg-slate-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${toneClass}`}
    >
      <Icon className="text-lg" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
