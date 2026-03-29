// CartDrawer.jsx
// Slide-in drawer showing cart items

import CartItem from "./CartItem";

export default function CartDrawer({ open, onClose, items }) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/40 z-40"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white z-50 shadow-lg
                    transform transition-transform duration-300
                    ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-lg">My Cart</h3>
          <button onClick={onClose} className="text-xl">✕</button>
        </div>

        {/* Cart Items */}
        <div className="p-4 space-y-3 overflow-y-auto">
          {items.length ? (
            items.map(item => (
              <CartItem key={item.id} item={item} />
            ))
          ) : (
            <p className="text-gray-500 text-center mt-10">
              Your cart is empty
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <button className="w-full bg-emerald-600 text-white py-2 rounded">
            Checkout
          </button>
        </div>
      </div>
    </>
  );
}
