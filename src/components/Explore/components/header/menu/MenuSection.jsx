export default function MenuSection({ title, children }) {
  return (
    <section className="space-y-1.5">
      <p className="px-4 pb-1 pt-4 text-xs font-black uppercase tracking-[0.22em] text-slate-500 sm:px-5">
        {title}
      </p>
      {children}
    </section>
  );
}
