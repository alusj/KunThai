export default function MenuSection({ title, children }) {
  return (
    <section className="space-y-1">
      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {title}
      </p>
      {children}
    </section>
  );
}
