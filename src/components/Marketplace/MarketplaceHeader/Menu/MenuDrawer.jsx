// MenuDrawer.jsx
// Buyer-focused marketplace utility drawer

import { createElement, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CreditCard,
  Heart,
  HelpCircle,
  History,
  LifeBuoy,
  LocateFixed,
  MapPin,
  PackageCheck,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";
import {
  fetchBuyerDeliveryAddresses,
  fetchSavedBuyerProducts,
  saveBuyerDeliveryAddress,
} from "../../../../Backend/services/marketplace/buyerMarketplaceService";
import Orders from "../../Orders";

const BUYER_ADDRESS_KEY = "marketplace-buyer-address";
const BUYER_ADDRESSES_KEY = "marketplace-buyer-addresses";
const BUYER_PAYMENT_KEY = "marketplace-buyer-payment";
const RECENT_PRODUCTS_KEY = "marketplace-recent-products";
const addressTypes = ["Resident", "Office", "Market", "School", "Other"];

const menuItems = [
  { id: "orders", label: "Ordered items", icon: PackageCheck },
  { id: "saved", label: "Saved products", icon: Heart },
  { id: "recent", label: "Recently viewed", icon: History },
  { id: "address", label: "Delivery address", icon: MapPin },
  { id: "payments", label: "Payment methods", icon: CreditCard },
  { id: "returns", label: "Returns & disputes", icon: RotateCcw },
  { id: "support", label: "Help & support", icon: LifeBuoy },
  { id: "settings", label: "Buyer settings", icon: Settings },
];

function readLocalValue(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function readBuyerAddress() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUYER_ADDRESS_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        id: saved.id || "",
        category: saved.category || saved.type || "Resident",
        customCategory: saved.customCategory || "",
        fullName: saved.fullName || saved.name || "",
        phone: saved.phone || "",
        street: saved.street || saved.address || "",
        note: saved.note || "",
        frontPictureUrl: saved.frontPictureUrl || "",
        detectedAddress: saved.detectedAddress || "",
        coordinates: saved.coordinates || null,
      };
    }
  } catch {
    const legacyAddress = readLocalValue(BUYER_ADDRESS_KEY);
    if (legacyAddress) {
      return {
        id: "",
        category: "Resident",
        customCategory: "",
        fullName: "",
        phone: "",
        street: legacyAddress,
        note: "",
        frontPictureUrl: "",
        detectedAddress: "",
        coordinates: null,
      };
    }
  }

  return {
    id: "",
    category: "Resident",
    customCategory: "",
    fullName: "",
    phone: "",
    street: "",
    note: "",
    frontPictureUrl: "",
    detectedAddress: "",
    coordinates: null,
  };
}

function readBuyerAddresses() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUYER_ADDRESSES_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function getAddressLabel(address) {
  return address.category === "Other" ? address.customCategory || "Other" : address.category || "Resident";
}

function createEmptyAddress() {
  return {
    id: "",
    category: "Resident",
    customCategory: "",
    fullName: "",
    phone: "",
    street: "",
    note: "",
    frontPictureUrl: "",
    detectedAddress: "",
    coordinates: null,
  };
}

function readRecentProducts() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  if (status === "shipped") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

function ProductMiniList({ products, emptyText, onProductSelect }) {
  if (!products.length) {
    return <p className="rounded-lg bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {products.slice(0, 8).map((product) => {
        const price = product.discountPrice && product.discountPrice < product.price ? product.discountPrice : product.price;

        return (
          <button
            key={product.id}
            type="button"
            onClick={() => onProductSelect?.(product)}
            className="kt-touchable flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
          >
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="h-12 w-12 rounded-lg bg-gray-100 object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-400">
                Img
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-gray-950">{product.name}</p>
              <p className="text-xs font-bold text-gray-500">{formatCurrency(price || 0)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function OrderedItemsList({ orders, loading }) {
  if (loading) {
    return <p className="rounded-lg bg-gray-50 p-4 text-center text-sm font-bold text-gray-500">Loading ordered items...</p>;
  }

  if (!orders.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <ReceiptText className="mx-auto text-gray-400" size={34} />
        <p className="mt-3 font-black text-gray-950">No ordered items yet</p>
        <p className="mt-1 text-sm font-medium text-gray-500">Checkout orders will appear here with seller, amount, and status.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.slice(0, 10).map((order) => (
        <article key={order.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-950">{order.preview || "UrMall order"}</p>
              <p className="mt-1 text-xs font-bold text-gray-500">{order.sellerName}</p>
            </div>
            <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-black capitalize ${statusTone(order.status)}`}>
              {order.status}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-gray-500">
              {order.itemCount} item{order.itemCount === 1 ? "" : "s"} | {formatDate(order.createdAt)}
            </p>
            <p className="text-base font-black text-gray-950">{formatCurrency(order.totalAmount)}</p>
          </div>
          {order.deliveryLocation ? <p className="mt-2 text-xs font-bold text-gray-500">{order.deliveryLocation}</p> : null}
        </article>
      ))}
    </div>
  );
}

function BuyerArticlePanel({ icon, tone = "emerald", title, summary, sections }) {
  const toneClass = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
          {createElement(icon, { size: 24 })}
        </span>
        <h4 className="mt-4 text-xl font-black text-gray-950">{title}</h4>
        <p className="mt-2 text-sm font-semibold leading-7 text-gray-600">{summary}</p>
      </section>

      {sections.map((section) => (
        <article key={section.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h5 className="text-base font-black text-gray-950">{section.title}</h5>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-sm font-semibold leading-7 text-gray-600">
              {paragraph}
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}

export default function MenuDrawer({ open, onClose }) {
  const [active, setActive] = useState(null);
  const [savedProducts, setSavedProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [address, setAddress] = useState(readBuyerAddress);
  const [savedAddresses, setSavedAddresses] = useState(readBuyerAddresses);
  const [locationCandidate, setLocationCandidate] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [payment, setPayment] = useState(() => readLocalValue(BUYER_PAYMENT_KEY));
  const [message, setMessage] = useState("");
  const [addressFormOpen, setAddressFormOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    setRecentProducts(readRecentProducts());
    fetchBuyerDeliveryAddresses()
      .then((addresses) => {
        if (addresses.length) {
          setSavedAddresses(addresses);
          setAddress(addresses[0]);
          localStorage.setItem(BUYER_ADDRESS_KEY, JSON.stringify(addresses[0]));
          localStorage.setItem(BUYER_ADDRESSES_KEY, JSON.stringify(addresses));
        }
      })
      .catch(() => null);
    fetchSavedBuyerProducts()
      .then(setSavedProducts)
      .catch((err) => setMessage(err.message || "Unable to load saved products."));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (active) {
          setActive(null);
          return;
        }
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onClose, open]);

  const activeTitle = useMemo(() => menuItems.find((item) => item.id === active)?.label || "Buyer Menu", [active]);

  async function saveAddress() {
    const localId = address.id || `local-address-${Date.now()}`;
    const localAddress = { ...address, id: localId };
    const nextAddresses = [localAddress, ...savedAddresses.filter((item) => item.id !== localId)];
    setSavedAddresses(nextAddresses);
    localStorage.setItem(BUYER_ADDRESS_KEY, JSON.stringify(localAddress));
    localStorage.setItem(BUYER_ADDRESSES_KEY, JSON.stringify(nextAddresses));
    try {
      const savedAddress = await saveBuyerDeliveryAddress(address);
      const syncedAddresses = [savedAddress, ...nextAddresses.filter((item) => item.id !== localId && item.id !== savedAddress.id)];
      setSavedAddresses(syncedAddresses);
      localStorage.setItem(BUYER_ADDRESS_KEY, JSON.stringify(savedAddress));
      localStorage.setItem(BUYER_ADDRESSES_KEY, JSON.stringify(syncedAddresses));
      setMessage("Delivery address saved.");
    } catch {
      setMessage("Delivery address saved on this device. Apply the buyer address SQL table to sync it online.");
    }
    setAddress(createEmptyAddress());
    setLocationCandidate(null);
    setLocationStatus("");
    setAddressFormOpen(false);
  }

  function updateAddress(patch) {
    setAddress((current) => ({ ...current, ...patch }));
  }

  function openAddAddress() {
    setAddress(createEmptyAddress());
    setLocationCandidate(null);
    setLocationStatus("");
    setMessage("");
    setAddressFormOpen(true);
  }

  function editAddress(nextAddress) {
    setAddress({ ...createEmptyAddress(), ...nextAddress });
    setLocationCandidate(null);
    setLocationStatus("");
    setMessage("");
    setAddressFormOpen(true);
  }

  function closeAddressForm() {
    setAddress(createEmptyAddress());
    setLocationCandidate(null);
    setLocationStatus("");
    setAddressFormOpen(false);
  }

  async function locateMe() {
    setLocationStatus("");
    setLocationCandidate(null);
    setMessage("");

    if (!navigator.geolocation) {
      setLocationStatus("Location is not available on this device.");
      return;
    }

    setLocationStatus("Checking your location...");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
          );
          const data = await response.json();
          const detectedAddress = data?.display_name || "";

          if (!detectedAddress) {
            setLocationStatus("We could not detect the exact address. Please enter it manually.");
            return;
          }

          setLocationCandidate({
            address: detectedAddress,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          setLocationStatus("");
        } catch {
          setLocationStatus("We could not detect the exact address. Please enter it manually.");
        }
      },
      (error) => {
        setLocationStatus(error.code === 1 ? "Location permission denied. Enter address manually." : "Unable to get your location right now.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function confirmDetectedLocation() {
    if (!locationCandidate) return;

    updateAddress({
      detectedAddress: locationCandidate.address,
      street: address.street || locationCandidate.address,
      coordinates: {
        latitude: locationCandidate.latitude,
        longitude: locationCandidate.longitude,
      },
    });
    setLocationStatus("Location added. You can edit the street before saving.");
    setLocationCandidate(null);
  }

  function rejectDetectedLocation() {
    setLocationCandidate(null);
    setLocationStatus("Enter the address manually.");
  }

  function handleFrontPictureChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => updateAddress({ frontPictureUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  function savePayment() {
    localStorage.setItem(BUYER_PAYMENT_KEY, payment);
    setMessage("Payment preference saved.");
  }

  function openProduct(product) {
    onClose?.();
    window.dispatchEvent(new CustomEvent("marketplace-open-product", { detail: { product } }));
  }

  function renderActiveContent() {
    return (
      <>
        {message && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}

        {active === "orders" && <Orders compact onProductOpen={openProduct} />}

        {active === "saved" && (
          <ProductMiniList
            products={savedProducts}
            emptyText="Saved products will appear here when you tap the heart on a listing."
            onProductSelect={openProduct}
          />
        )}

        {active === "recent" && (
          <ProductMiniList
            products={recentProducts}
            emptyText="Recently viewed products will appear here after opening product details."
            onProductSelect={openProduct}
          />
        )}

        {active === "address" && (
          <div className="space-y-4">
            {savedAddresses.length ? (
              <div className="space-y-2">
                <p className="text-sm font-black text-gray-950">Saved addresses</p>
                {savedAddresses.map((item) => (
                  <button
                    key={item.id || `${item.category}-${item.street}`}
                    type="button"
                    onClick={() => editAddress(item)}
                    className="kt-touchable w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-gray-950">{getAddressLabel(item)} address</p>
                      <span className="text-xs font-black text-emerald-700">Edit</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">{item.street || item.detectedAddress}</p>
                  </button>
                ))}
              </div>
            ) : null}

            {!addressFormOpen ? (
              <button
                type="button"
                onClick={openAddAddress}
                className="kt-touchable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
              >
                <Plus size={17} />
                {savedAddresses.length ? "Add Another Address" : "Add Address"}
              </button>
            ) : null}

            {addressFormOpen ? (
              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-gray-950">
                      {address.id ? "Edit delivery address" : "Add delivery address"}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                      Save receiver, phone, street, and delivery notes for faster UrMall checkout.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAddressForm}
                    className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"
                    aria-label="Close delivery address form"
                  >
                    <X size={16} />
                  </button>
                </div>

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">Location category</span>
                <select
                  value={address.category}
                  onChange={(event) => updateAddress({ category: event.target.value })}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                >
                  {addressTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              {address.category === "Other" ? (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Custom category</span>
                  <input
                    value={address.customCategory}
                    onChange={(event) => updateAddress({ customCategory: event.target.value })}
                    placeholder="Eg. Warehouse, clinic, church"
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Full name</span>
                  <input
                    value={address.fullName}
                    onChange={(event) => updateAddress({ fullName: event.target.value })}
                    placeholder="Receiver name"
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Phone number</span>
                  <input
                    value={address.phone}
                    onChange={(event) => updateAddress({ phone: event.target.value })}
                    placeholder="Phone number"
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">Street</span>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={address.street}
                    onChange={(event) => updateAddress({ street: event.target.value })}
                    placeholder="Street, city, landmark"
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={locateMe}
                    className="kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
                  >
                    <LocateFixed size={16} />
                    Locate me
                  </button>
                </div>
              </label>

              {locationCandidate ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-black text-emerald-950">
                    Your current location is {locationCandidate.address}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={confirmDetectedLocation}
                      className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 size={15} />
                      Correct, add location
                    </button>
                    <button
                      type="button"
                      onClick={rejectDetectedLocation}
                      className="kt-touchable h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
                    >
                      Wrong, enter manually
                    </button>
                  </div>
                </div>
              ) : null}

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">Apartment, stall no / delivery note</span>
                <textarea
                  value={address.note}
                  onChange={(event) => updateAddress({ note: event.target.value })}
                  placeholder="Apartment, stall number, color of gate, nearby shop, or rider note"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-black uppercase text-gray-500">Address front picture</span>
                <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
                    {address.frontPictureUrl ? (
                      <img src={address.frontPictureUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="text-gray-400" size={30} />
                    )}
                  </div>
                  <div className="flex flex-col justify-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFrontPictureChange}
                      className="text-sm font-semibold text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-950 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
                    />
                    <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
                      Add a front-facing picture of the gate, stall, office entrance, or building.
                    </p>
                  </div>
                </div>
              </label>

              {address.detectedAddress ? (
                <p className="rounded-xl bg-gray-50 p-3 text-xs font-bold leading-5 text-gray-600">
                  Detected location: {address.detectedAddress}
                </p>
              ) : null}
              {locationStatus ? <p className="text-sm font-bold text-gray-600">{locationStatus}</p> : null}
              </div>
            ) : null}

            {addressFormOpen ? (
              <button
                type="button"
                onClick={saveAddress}
                className="kt-touchable h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700"
              >
                {address.id ? "Update Delivery Address" : "Save Delivery Address"}
              </button>
            ) : null}
          </div>
        )}

        {active === "payments" && (
          <div className="space-y-4">
            <BuyerArticlePanel
              icon={CreditCard}
              tone="amber"
              title="Payment methods are coming soon"
              summary="UrMall payment methods are currently unavailable because we are preparing a safer payment service that will connect directly to products, orders, sellers, and buyer records."
              sections={[
                {
                  title: "Why this is not active yet",
                  paragraphs: [
                    "A payment method page should not only collect a card, account, or wallet name. It should protect the buyer, identify the seller, connect the payment to a real item, and keep a clear order record. Until that full service is ready, UrMall will not pretend that built-in payments are available.",
                    "This protects buyers from confusing payment instructions and protects serious sellers from disputes caused by incomplete payment tracking.",
                  ],
                },
                {
                  title: "How buyers should pay for now",
                  paragraphs: [
                    "Before sending money, confirm the product name, final price, delivery fee, seller identity, delivery address, and expected delivery or pickup arrangement. If anything feels unclear, message the seller and ask for confirmation before paying.",
                    "Keep important conversations inside UrMall where possible. A clear message history helps both the buyer and seller remember what was agreed.",
                  ],
                },
              ]}
            />
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <label className="block text-sm font-black text-gray-950">Temporary payment note</label>
              <textarea
                value={payment}
                onChange={(event) => setPayment(event.target.value)}
                placeholder="KunThai Money, cash on pickup, bank transfer, or preferred method"
                className="min-h-32 w-full rounded-xl border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
              />
              <button type="button" onClick={savePayment} className="kt-touchable rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700">
                Save Payment Preference
              </button>
            </div>
          </div>
        )}

        {active === "returns" && (
          <BuyerArticlePanel
            icon={ShieldAlert}
            tone="amber"
            title="Returns & disputes"
            summary="Returns and disputes should be handled through the order context so the seller, product, price, delivery address, and conversation history stay connected."
            sections={[
              {
                title: "Start with the order",
                paragraphs: [
                  "If a product arrives damaged, different from the listing, late, missing, or not delivered, begin from the related order or buyer-seller message. That gives support and the seller the information needed to understand what happened.",
                  "A strong dispute includes the product name, order date, seller name, agreed price, delivery details, photos where useful, and a clear explanation of what you expected versus what happened.",
                ],
              },
              {
                title: "Be clear before escalating",
                paragraphs: [
                  "Many problems can be solved quickly when buyers explain the issue calmly and give the seller a fair chance to respond. If the seller does not respond or the issue involves fraud, unsafe behavior, or serious misrepresentation, the matter should be escalated with evidence.",
                  "UrMall is being shaped as a trusted marketplace, so return and dispute tools should protect honest buyers without unfairly punishing honest sellers.",
                ],
              },
            ]}
          />
        )}

        {active === "support" && (
          <BuyerArticlePanel
            icon={HelpCircle}
            title="Help & support"
            summary="Buyer support exists to help you shop with confidence, understand sellers clearly, and resolve problems without losing the order history that proves what happened."
            sections={[
              {
                title: "Where to get help",
                paragraphs: [
                  "For product questions, delivery arrangements, availability, and price confirmation, message the seller from the product or order. Product-linked messages are better than random chats because they preserve the item context.",
                  "For account, safety, suspicious seller behavior, fake payment requests, or repeated order problems, use UrMall support when the ticket system becomes active. Until then, keep evidence and use the most relevant seller message or order record.",
                ],
              },
              {
                title: "How to write a useful support request",
                paragraphs: [
                  "A professional support request should explain the product, seller, order date, payment expectation, delivery address, and the exact problem. Short messages like 'seller problem' or 'my order bad' make support slower because important facts are missing.",
                  "Clear support communication protects you. It also helps UrMall identify fake marketplace behavior and protect serious sellers from false complaints.",
                ],
              },
            ]}
          />
        )}

        {active === "settings" && (
          <BuyerArticlePanel
            icon={Settings}
            tone="blue"
            title="Buyer settings"
            summary="Buyer settings help you keep your UrMall shopping activity organized, private, and ready for checkout."
            sections={[
              {
                title: "What your buyer menu controls",
                paragraphs: [
                  "Your buyer menu keeps ordered items, saved products, recently viewed products, delivery addresses, temporary payment notes, support guidance, and dispute guidance in one place. This makes UrMall feel like a proper buying workspace instead of scattered screens.",
                  "Saved addresses make ordering faster, especially when you use different delivery locations such as home, office, market, school, or another custom place.",
                ],
              },
              {
                title: "Privacy and accuracy",
                paragraphs: [
                  "Keep your phone number, receiver name, and delivery notes accurate before placing an order. Wrong delivery information can delay the seller, confuse riders, and create disputes that could have been avoided.",
                  "Location coordinates and address details should only support delivery and order handling. They should not be treated as public profile information.",
                ],
              },
            ]}
          />
        )}
      </>
    );
  }

  return (
    <>
      {open && <button type="button" aria-label="Close buyer menu overlay" onClick={onClose} className="kt-backdrop fixed inset-0 z-40" />}

      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? "kt-panel-enter translate-x-0" : "translate-x-full"
        }`}
      >
        {!active ? (
          <>
            <div className="kt-header-glass flex items-center justify-between px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">UrMall</p>
                <h3 className="mt-1 text-2xl font-black text-gray-950">Buyer Menu</h3>
              </div>
              <button
                onClick={onClose}
                className="kt-touchable inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
                aria-label="Close buyer menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 sm:px-6 lg:px-8">
              <div className="grid gap-3 lg:grid-cols-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActive(item.id);
                        setMessage("");
                      }}
                      className="kt-touchable flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-md hover:shadow-emerald-950/5"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-gray-950">{item.label}</span>
                        <span className="mt-1 block line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
                          Manage your {item.label.toLowerCase()}.
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </>
        ) : (
          <>
            <div className="kt-header-glass flex items-start gap-3 px-4 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="kt-touchable mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-800 hover:bg-gray-200"
                aria-label="Back to buyer menu"
              >
                <ArrowLeft size={22} />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Buyer Menu</p>
                <h3 className="mt-1 truncate text-2xl font-black text-gray-950">{activeTitle}</h3>
              </div>
            </div>
            <section className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4 sm:px-6 lg:px-8">
              {renderActiveContent()}
            </section>
          </>
        )}
        </div>
    </>
  );
}
