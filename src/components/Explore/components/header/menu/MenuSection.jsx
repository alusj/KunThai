export default function MenuSection({ title, description = "", children }) {
  return (
    <section className="min-w-0">
      <div className="px-2 pb-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{title}</p>
        {description ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="space-y-1 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-sm">{children}</div>
    </section>
  );
}
