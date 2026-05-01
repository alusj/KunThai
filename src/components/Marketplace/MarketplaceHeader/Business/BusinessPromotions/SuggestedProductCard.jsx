export default function SuggestedProductCard({ product }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-black text-gray-950">{product.name}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-gray-500">{product.reason}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
          {product.suggestedDiscount}
        </span>
        <button
          type="button"
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50"
          onClick={() => console.log("Promote suggested product", product.id)}
        >
          Promote
        </button>
      </div>
    </article>
  );
}
