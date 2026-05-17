// CartItem.jsx
// Single cart item row

import { useState } from "react";
import { Check, Copy, Eye, Minus, MoreHorizontal, Plus, Share2, Trash2 } from "lucide-react";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";
import { showToast } from "../../../../Backend/services/toastService";

function productLink(item) {
  const productId = item.productId || item.product?.id;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#marketplace-product-${encodeURIComponent(productId)}`;
}

export default function CartItem({ item, onUpdateQty, onRemoveItem, onViewProduct }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const stock = Number(item.product?.stock || 0);

  async function copyProduct() {
    const link = productLink(item);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      showToast("Product link copied", "success");
    } catch {
      showToast(link, "info");
    }
  }

  async function shareProduct() {
    const link = productLink(item);
    const sharePayload = {
      title: item.name,
      text: `View ${item.name} on KunThai UrMall`,
      url: link,
    };

    if (navigator.share) {
      try {
        await navigator.share(sharePayload);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    await copyProduct();
    showToast("Sharing is not available here, so the product link was copied.", "info");
  }

  function runAction(event, action) {
    event.stopPropagation();
    setMenuOpen(false);
    action?.(item);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onViewProduct?.(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onViewProduct?.(item);
        }
      }}
      className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
    >
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
        {stock ? <p className="mt-0.5 text-[11px] font-bold text-gray-400">{stock} in stock</p> : null}
      </div>

      <div className="flex flex-col items-end justify-between">
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((current) => !current);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label={`Open actions for ${item.name}`}
          >
            <MoreHorizontal size={17} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl">
              <button
                type="button"
                onClick={(event) => runAction(event, onViewProduct)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
              >
                <Eye size={15} />
                View product
              </button>
              <button
                type="button"
                onClick={(event) => runAction(event, copyProduct)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                Copy link
              </button>
              <button
                type="button"
                onClick={(event) => runAction(event, shareProduct)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
              >
                <Share2 size={15} />
                Share product
              </button>
              <button
                type="button"
                onClick={(event) => runAction(event, onRemoveItem)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onUpdateQty?.(item, item.qty - 1);
            }}
            className="inline-flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100"
            aria-label={`Decrease ${item.name} quantity`}
          >
            <Minus size={14} />
          </button>
          <span className="w-8 text-center text-sm font-black">{item.qty}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (stock && item.qty >= stock) return;
              onUpdateQty?.(item, item.qty + 1);
            }}
            disabled={Boolean(stock && item.qty >= stock)}
            className="inline-flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Increase ${item.name} quantity`}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
