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
      className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition sm:px-5 ${toneClass}`}
    >
      <Icon className="text-2xl" />
      <span className="text-base font-semibold sm:text-lg">{label}</span>
    </button>
  );
}
