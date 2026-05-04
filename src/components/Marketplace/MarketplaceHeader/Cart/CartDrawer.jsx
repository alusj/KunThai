// CartDrawer.jsx
// Slide-in drawer showing cart items

import { useState } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";
import CartItem from "./CartItem";

export default function CartDrawer({ open, onClose, items, loading, error, onUpdateQty, onRemoveItem, onCheckout }) {
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  async function handleCheckout() {
    setCheckoutStatus("");

    try {
      const orders = await onCheckout?.(deliveryLocation);
      setCheckoutStatus(`${orders.length} order${orders.length === 1 ? "" : "s"} created.`);
      setDeliveryLocation("");
    } catch (err) {
      setCheckoutStatus(err.message || "Checkout failed.");
    }
  }

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />}

      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md transform bg-white shadow-lg transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-lg font-black text-gray-950">My Cart</h3>
            <p className="text-xs font-bold text-gray-500">
              {items.length} product{items.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            aria-label="Close cart"
          >
            <X size={18} />
          </button>
        </div>

        <div className="h-[calc(100%-15rem)] space-y-3 overflow-y-auto p-4">
          {loading ? (
            <p className="text-center text-sm font-bold text-gray-500">Loading cart...</p>
          ) : items.length ? (
            items.map((item) => (
              <CartItem key={item.id} item={item} onUpdateQty={onUpdateQty} onRemoveItem={onRemoveItem} />
            ))
          ) : (
            <p className="mt-10 text-center font-bold text-gray-500">Your cart is empty</p>
          )}

          {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          {checkoutStatus && (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{checkoutStatus}</p>
          )}
        </div>

        <div className="space-y-3 border-t p-4">
          <input
            value={deliveryLocation}
            onChange={(event) => setDeliveryLocation(event.target.value)}
            placeholder="Delivery location or pickup note"
            className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-gray-500">Total</span>
            <span className="text-xl font-black text-gray-950">{formatCurrency(total)}</span>
          </div>
          <button
            type="button"
            onClick={handleCheckout}
            disabled={!items.length || loading}
            className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Checkout
          </button>
        </div>
      </div>
    </>
  );
}
