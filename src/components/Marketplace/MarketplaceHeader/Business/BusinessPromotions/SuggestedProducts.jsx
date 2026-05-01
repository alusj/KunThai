import SuggestedProductCard from "./SuggestedProductCard";

export default function SuggestedProducts({ products }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-gray-950">Suggested products to promote</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        Products with signals that could benefit from more visibility.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {products.map((product) => (
          <SuggestedProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
