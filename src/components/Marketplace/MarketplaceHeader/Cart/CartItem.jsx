// CartItem.jsx
// Single cart item row

export default function CartItem({ item }) {
  return (
    <div className="flex gap-3 items-center border rounded p-2">
      {/* Image placeholder */}
      <div className="w-14 h-14 bg-slate-100 rounded flex items-center justify-center text-xs text-gray-400">
        Img
      </div>

      {/* Info */}
      <div className="flex-1">
        <p className="font-medium text-sm">{item.name}</p>
        <p className="text-xs text-gray-500">${item.price}</p>
      </div>

      {/* Quantity */}
      <span className="text-sm font-semibold">
        ×{item.qty}
      </span>
    </div>
  );
}
