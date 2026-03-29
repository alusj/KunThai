// Cart.jsx
// Cart controller: manages state & wiring

import { useState } from "react";
import CartButton from "./CartButton";
import CartDrawer from "./CartDrawer";

export default function Cart() {
  // =========================
  // Cart open/close state
  // =========================
  const [open, setOpen] = useState(false);

  // =========================
  // Temporary mock cart data
  // =========================
  const cartItems = [
    { id: 1, name: "Wireless Headphones", price: 90, qty: 1 },
    { id: 2, name: "Smart Watch", price: 80, qty: 2 },
  ];

  return (
    <>
      {/* Cart icon button */}
      <CartButton
        count={cartItems.length}
        onClick={() => setOpen(true)}
      />

      {/* Cart drawer */}
      <CartDrawer
        open={open}
        onClose={() => setOpen(false)}
        items={cartItems}
      />
    </>
  );
}
