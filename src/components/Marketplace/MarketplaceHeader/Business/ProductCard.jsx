// =======================
// ProductCard.jsx
// Reusable product display card for buyers
// =======================

export default function ProductCard({ product }) {
  return (
    <div className="border rounded-lg p-3 hover:shadow transition bg-white">

      {/* =======================
          Product image placeholder
      ======================= */}
      <div className="h-32 bg-slate-100 rounded mb-2 flex items-center justify-center text-gray-400">
        Image
      </div>

      {/* =======================
          Product name
      ======================= */}
      <h4 className="font-medium text-gray-800 truncate">
        {product.name}
      </h4>

      {/* =======================
          Price section
      ======================= */}
      <div className="mt-1 text-sm">
        {product.discount_price ? (
          <>
            <span className="text-red-600 font-semibold">
              ${product.discount_price}
            </span>
            <span className="line-through text-gray-400 ml-2">
              ${product.price}
            </span>
          </>
        ) : (
          <span className="font-semibold">${product.price}</span>
        )}
      </div>

      {/* =======================
          Buyer actions
      ======================= */}
      <div className="mt-3 space-y-2">

        {/* Add to cart */}
        <button className="w-full bg-emerald-600 text-white py-1.5 rounded text-sm hover:bg-emerald-700">
          Add to Cart
        </button>

        {/* Message seller (negotiation entry point) */}
        <button className="w-full border py-1.5 rounded text-sm hover:bg-slate-50">
          Message Seller
        </button>

      </div>
    </div>
  );
}
