// CartDrawer.jsx
// Slide-in drawer showing cart items

import { useEffect, useState } from "react";
import { CheckCircle2, MapPin, PackageCheck, Truck } from "lucide-react";
import AppPortal from "../../../shared/AppPortal";
import AppBackTab from "../../../shared/AppBackTab";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";
import { fetchBuyerDeliveryAddresses } from "../../../../Backend/services/marketplace/buyerMarketplaceService";
import CartItem from "./CartItem";

const BUYER_ADDRESSES_KEY = "marketplace-buyer-addresses";
const BUYER_PAYMENT_KEY = "marketplace-buyer-payment";

function readSavedAddresses() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUYER_ADDRESSES_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function readPaymentPreference() {
  try {
    return localStorage.getItem(BUYER_PAYMENT_KEY) || "";
  } catch {
    return "";
  }
}

function getAddressText(address = {}) {
  return address.street || address.address || address.detectedAddress || "";
}

function getAddressLabel(address = {}) {
  return address.category === "Other" ? address.customCategory || "Other" : address.category || address.type || "Address";
}

export default function CartDrawer({
  open,
  onClose,
  items,
  loading,
  error,
  onUpdateQty,
  onRemoveItem,
  onViewProduct,
  onCheckout,
}) {
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("delivery");
  const [savedAddresses, setSavedAddresses] = useState(readSavedAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [paymentPreference, setPaymentPreference] = useState(readPaymentPreference);
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const moneyScope = items[0]?.product?.currency || items[0]?.product?.countryCode || items[0]?.product?.country;
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const selectedAddress = savedAddresses.find((address) => String(address.id) === String(selectedAddressId));
  const checkoutReady = deliveryMode === "pickup" || Boolean(getAddressText(selectedAddress) || deliveryLocation.trim());

  useEffect(() => {
    if (!open) return;

    setPaymentPreference(readPaymentPreference());
    const localAddresses = readSavedAddresses();
    setSavedAddresses(localAddresses);
    setSelectedAddressId((current) => current || localAddresses[0]?.id || "");

    fetchBuyerDeliveryAddresses()
      .then((addresses) => {
        if (!addresses.length) return;
        setSavedAddresses(addresses);
        setSelectedAddressId((current) => current || addresses[0]?.id || "");
        localStorage.setItem(BUYER_ADDRESSES_KEY, JSON.stringify(addresses));
      })
      .catch(() => null);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  async function handleCheckout() {
    setCheckoutStatus("");
    if (!checkoutReady) {
      setCheckoutStatus("Choose a delivery address or switch to pickup.");
      return;
    }

    try {
      const addressText = getAddressText(selectedAddress);
      const checkoutNote = [
        `Fulfillment: ${deliveryMode}`,
        deliveryMode === "delivery" && addressText ? `${getAddressLabel(selectedAddress)} address: ${addressText}` : "",
        deliveryMode === "delivery" && selectedAddress?.phone ? `Phone: ${selectedAddress.phone}` : "",
        deliveryLocation.trim() ? `Note: ${deliveryLocation.trim()}` : "",
        paymentPreference ? `Payment preference: ${paymentPreference}` : "",
      ].filter(Boolean).join(" | ");
      const orders = await onCheckout?.(checkoutNote);
      setCheckoutStatus(`${orders.length} order${orders.length === 1 ? "" : "s"} created.`);
      setDeliveryLocation("");
    } catch (err) {
      setCheckoutStatus(err.message || "Checkout failed.");
    }
  }

  return (
    <AppPortal>
      <div
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 z-[1200] flex h-dvh w-screen transform flex-col bg-white shadow-2xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="kt-header-glass flex h-16 items-center gap-3 px-3 sm:px-4">
          <AppBackTab onBack={onClose} label="Back to UrMall" historyKey="urmall-cart" useHistoryLayer={false} />
          <div className="min-w-0">
            <h3 className="text-lg font-black text-gray-950">Checkout Cart</h3>
            <p className="text-xs font-bold text-gray-500">
              {itemCount} item{itemCount === 1 ? "" : "s"} from {items.length} product{items.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setDeliveryMode("delivery")}
              className={`kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-black ${
                deliveryMode === "delivery" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-600"
              }`}
            >
              <Truck size={15} />
              Delivery
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode("pickup")}
              className={`kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-black ${
                deliveryMode === "pickup" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-600"
              }`}
            >
              <PackageCheck size={15} />
              Pickup
            </button>
          </div>

          {deliveryMode === "delivery" && savedAddresses.length ? (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase text-gray-500">Saved addresses</p>
              {savedAddresses.slice(0, 3).map((address) => {
                const selected = String(selectedAddressId) === String(address.id);
                return (
                  <button
                    key={address.id || `${address.category}-${getAddressText(address)}`}
                    type="button"
                    onClick={() => setSelectedAddressId(address.id)}
                    className={`kt-touchable flex w-full items-start gap-2 rounded-xl border p-3 text-left ${
                      selected ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    {selected ? <CheckCircle2 className="mt-0.5 text-emerald-700" size={16} /> : <MapPin className="mt-0.5 text-gray-400" size={16} />}
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-gray-950">{getAddressLabel(address)} address</span>
                      <span className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">{getAddressText(address)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {items.length ? (
            items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                onUpdateQty={onUpdateQty}
                onRemoveItem={onRemoveItem}
                onViewProduct={onViewProduct}
              />
            ))
          ) : !loading ? (
            <p className="mt-10 text-center font-bold text-gray-500">Your cart is empty</p>
          ) : null}

          {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        </div>

        <div className="shrink-0 space-y-3 border-t p-4">
          <input
            value={deliveryLocation}
            onChange={(event) => setDeliveryLocation(event.target.value)}
            placeholder={deliveryMode === "pickup" ? "Pickup note or preferred time" : "Delivery note or manual address"}
            className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-gray-500">Items</span>
              <span className="font-black text-gray-950">{itemCount}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-bold text-gray-500">Payment</span>
              <span className="max-w-[11rem] truncate font-black text-gray-950">{paymentPreference || "Confirm with seller"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-bold text-gray-500">Subtotal</span>
              <span className="text-xl font-black text-gray-950">{formatCurrency(total, moneyScope)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-gray-500">Total</span>
            <span className="text-xl font-black text-gray-950">{formatCurrency(total, moneyScope)}</span>
          </div>
          {checkoutStatus && (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{checkoutStatus}</p>
          )}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={!items.length || loading || !checkoutReady}
            className="kt-touchable w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review & Create Order
          </button>
        </div>
      </div>
    </AppPortal>
  );
}
