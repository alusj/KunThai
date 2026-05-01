import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";

export default function TopSellingProducts({ products }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-gray-950">Top-selling products</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        Products bringing in the most sales right now.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {products.map((product) => (
          <article key={product.id} className="rounded-lg border border-gray-200 p-4">
            <p className="font-black text-gray-950">{product.name}</p>
            <p className="mt-1 text-sm font-medium text-gray-500">
              {product.sales} sales · {formatCurrency(product.revenue)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
