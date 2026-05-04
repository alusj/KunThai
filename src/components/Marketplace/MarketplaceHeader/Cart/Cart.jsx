// Cart.jsx
// Cart controller: manages state & wiring

import { useEffect, useState } from "react";
import {
  checkoutBuyerCart,
  fetchBuyerCart,
  removeBuyerCartItem,
  updateBuyerCartItem,
} from "../../../../Backend/services/marketplace/buyerMarketplaceService";
import CartButton from "./CartButton";
import CartDrawer from "./CartDrawer";

export default function Cart() {
  const [open, setOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadCart() {
    setLoading(true);
    setError("");

    try {
      const items = await fetchBuyerCart();
      setCartItems(items);
    } catch (err) {
      setCartItems([]);
      setError(err.message || "Unable to load cart.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCart();
    window.addEventListener("marketplace-cart-updated", loadCart);

    return () => {
      window.removeEventListener("marketplace-cart-updated", loadCart);
    };
  }, []);

  async function updateQty(item, quantity) {
    try {
      await updateBuyerCartItem(item.id, quantity);
      await loadCart();
    } catch (err) {
      setError(err.message || "Unable to update cart.");
    }
  }

  async function removeItem(item) {
    try {
      await removeBuyerCartItem(item.id);
      await loadCart();
    } catch (err) {
      setError(err.message || "Unable to remove item.");
    }
  }

  async function checkout(deliveryLocation) {
    const orders = await checkoutBuyerCart(deliveryLocation);
    await loadCart();
    return orders;
  }

  const count = cartItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <>
      <CartButton count={count} onClick={() => setOpen(true)} />
      <CartDrawer
        open={open}
        onClose={() => setOpen(false)}
        items={cartItems}
        loading={loading}
        error={error}
        onUpdateQty={updateQty}
        onRemoveItem={removeItem}
        onCheckout={checkout}
      />
    </>
  );
}
