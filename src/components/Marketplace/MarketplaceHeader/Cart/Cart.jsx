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
import { urMallShareToastOptions } from "../../../../Backend/services/shareCtaService";
import { haptics, sounds } from "../../../../Backend/services/feedbackService";
import { useI18n, t } from "../../../../i18n";
import CartButton from "./CartButton";
import CartDrawer from "./CartDrawer";

export default function Cart({ onOpenChange }) {
  useI18n();
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
      setError(err.message || t("urmall.cart.loadFailed"));
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
      showToast(quantity <= 0 ? t("urmall.cart.removedFromCart") : t("urmall.cart.cartUpdated"), "success");
    } catch (err) {
      setError(err.message || t("urmall.cart.updateFailed"));
      showToast(err.message || t("urmall.cart.updateFailed"), "danger");
    }
  }

  async function removeItem(item) {
    try {
      await removeBuyerCartItem(item.id);
      await loadCart();
      showToast(t("urmall.cart.removedFromCart"), "success");
    } catch (err) {
      setError(err.message || t("urmall.cart.removeFailed"));
      showToast(err.message || t("urmall.cart.removeFailed"), "danger");
    }
  }

  async function checkout(deliveryLocation, options = {}) {
    const orders = await checkoutBuyerCart(deliveryLocation, options);
    await loadCart();
    haptics.medium("marketplace");
    sounds.success("marketplace");
    showToast(t("urmall.cart.checkoutSuccess"), "success", urMallShareToastOptions());
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
