export default function SellerDrawerSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-black uppercase tracking-wide text-gray-400">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
