// Cart.jsx
// Cart controller: manages state & wiring

import { useEffect, useState } from "react";
import {
  checkoutBuyerCart,
  fetchBuyerCart,
  removeBuyerCartItem,
  updateBuyerCartItem,
} from "../../../../Backend/services/marketplace/buyerMarketplaceService";
import { showToast } from "../../../../Backend/services/toastService";
import CartButton from "./CartButton";
import CartDrawer from "./CartDrawer";

export default function Cart({ onOpenChange }) {
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

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  async function updateQty(item, quantity) {
    try {
      await updateBuyerCartItem(item.id, quantity);
      await loadCart();
      showToast(quantity <= 0 ? "Product removed from cart" : "Cart updated", "success");
    } catch (err) {
      setError(err.message || "Unable to update cart.");
      showToast(err.message || "Unable to update cart.", "danger");
    }
  }

  async function removeItem(item) {
    try {
      await removeBuyerCartItem(item.id);
      await loadCart();
      showToast("Product removed from cart", "success");
    } catch (err) {
      setError(err.message || "Unable to remove item.");
      showToast(err.message || "Unable to remove item.", "danger");
    }
  }

  async function checkout(deliveryLocation) {
    const orders = await checkoutBuyerCart(deliveryLocation);
    await loadCart();
    showToast("Checkout created successfully", "success");
    return orders;
  }

  function viewProduct(item) {
    const product = item.product || {
      id: item.productId,
      businessId: item.businessId,
      name: item.name,
      imageUrl: item.imageUrl,
      location: item.location,
      price: item.price,
    };

    setOpen(false);
    window.dispatchEvent(new CustomEvent("marketplace-open-product", { detail: { product } }));
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
        onViewProduct={viewProduct}
        onCheckout={checkout}
      />
    </>
  );
}
