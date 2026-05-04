// CartItem.jsx
// Single cart item row

import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";

export default function CartItem({ item, onUpdateQty, onRemoveItem }) {
  return (
    <div className="flex gap-3 rounded-lg border border-gray-200 bg-white p-2">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="h-16 w-16 rounded-lg bg-slate-100 object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-gray-400">
          Img
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-black text-gray-950">{item.name}</p>
        <p className="mt-1 text-xs font-bold text-gray-500">{formatCurrency(item.price)}</p>
        <p className="truncate text-xs font-semibold text-gray-400">{item.location}</p>
      </div>

      <div className="flex flex-col items-end justify-between">
        <button
          type="button"
          onClick={() => onRemoveItem?.(item)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 size={15} />
        </button>
        <div className="flex items-center rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => onUpdateQty?.(item, item.qty - 1)}
            className="inline-flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100"
            aria-label={`Decrease ${item.name} quantity`}
          >
            <Minus size={14} />
          </button>
          <span className="w-8 text-center text-sm font-black">{item.qty}</span>
          <button
            type="button"
            onClick={() => onUpdateQty?.(item, item.qty + 1)}
            className="inline-flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100"
            aria-label={`Increase ${item.name} quantity`}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
