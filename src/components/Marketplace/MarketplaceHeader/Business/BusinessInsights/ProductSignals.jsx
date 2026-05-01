import ProductSignalCard from "./ProductSignalCard";

export default function ProductSignals({ signals }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-gray-950">Product behavior</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        Products getting attention and products losing buyers.
      </p>

      <div className="mt-4 grid gap-3">
        <ProductSignalCard
          title="Most viewed product"
          product={signals.mostViewed}
          tone="green"
        />
        <ProductSignalCard
          title="Most abandoned product"
          product={signals.mostAbandoned}
          tone="amber"
        />
      </div>
    </section>
  );
}
