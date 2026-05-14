// MenuDrawer.jsx
// Buyer-focused marketplace utility drawer

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  Heart,
  HelpCircle,
  History,
  LifeBuoy,
  LogOut,
  MapPin,
  RotateCcw,
  Settings,
  ShieldAlert,
  X,
} from "lucide-react";
import { signOutUser } from "../../../../Backend/services/authService";
import { formatCurrency } from "../../../../Backend/utils/formatCurrency";
import { fetchSavedBuyerProducts } from "../../../../Backend/services/marketplace/buyerMarketplaceService";

const BUYER_ADDRESS_KEY = "marketplace-buyer-address";
const BUYER_PAYMENT_KEY = "marketplace-buyer-payment";
const RECENT_PRODUCTS_KEY = "marketplace-recent-products";

const menuItems = [
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

function readRecentProducts() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PRODUCTS_KEY) || "[]");
  } catch {
    return [];
  }
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
            className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
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

export default function MenuDrawer({ open, onClose }) {
  const [active, setActive] = useState("saved");
  const [savedProducts, setSavedProducts] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const [address, setAddress] = useState(() => readLocalValue(BUYER_ADDRESS_KEY));
  const [payment, setPayment] = useState(() => readLocalValue(BUYER_PAYMENT_KEY));
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;

    setRecentProducts(readRecentProducts());
    fetchSavedBuyerProducts()
      .then(setSavedProducts)
      .catch((err) => setMessage(err.message || "Unable to load saved products."));
  }, [open]);

  const activeTitle = useMemo(() => menuItems.find((item) => item.id === active)?.label || "Menu", [active]);

  function saveAddress() {
    localStorage.setItem(BUYER_ADDRESS_KEY, address);
    setMessage("Delivery address saved.");
  }

  function savePayment() {
    localStorage.setItem(BUYER_PAYMENT_KEY, payment);
    setMessage("Payment preference saved.");
  }

  async function signOut() {
    await signOutUser();
    window.location.reload();
  }

  function openProduct(product) {
    onClose?.();
    window.dispatchEvent(new CustomEvent("marketplace-open-product", { detail: { product } }));
  }

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40" />}

      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl transform flex-col bg-white shadow-lg transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div>
            <h3 className="text-lg font-black text-gray-950">Buyer Menu</h3>
            <p className="text-xs font-bold text-gray-500">{activeTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            aria-label="Close buyer menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr]">
          <nav className="border-r bg-gray-50 p-3">
            <div className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const selected = active === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActive(item.id);
                      setMessage("");
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black transition ${
                      selected ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-white"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={signOut}
              className="mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-black text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </nav>

          <section className="min-w-0 overflow-y-auto p-4">
            {message && <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}

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
              <div className="space-y-3">
                <label className="block text-sm font-black text-gray-950">Default delivery address</label>
                <textarea
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Street, city, landmark, phone note"
                  className="min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                />
                <button onClick={saveAddress} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                  Save Address
                </button>
              </div>
            )}

            {active === "payments" && (
              <div className="space-y-3">
                <label className="block text-sm font-black text-gray-950">Payment preference</label>
                <textarea
                  value={payment}
                  onChange={(event) => setPayment(event.target.value)}
                  placeholder="KunThai Money, cash on pickup, bank transfer, or preferred method"
                  className="min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                />
                <button onClick={savePayment} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                  Save Payment Preference
                </button>
              </div>
            )}

            {active === "returns" && (
              <div className="rounded-lg border border-gray-200 p-4">
                <ShieldAlert className="text-amber-600" size={28} />
                <h4 className="mt-3 font-black text-gray-950">Returns & disputes</h4>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                  Start from the related order or message so the seller, product, amount, and delivery context stay attached.
                </p>
              </div>
            )}

            {active === "support" && (
              <div className="rounded-lg border border-gray-200 p-4">
                <HelpCircle className="text-emerald-700" size={28} />
                <h4 className="mt-3 font-black text-gray-950">Help & support</h4>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                  For order help, contact the seller in Messages. For account or safety issues, use Explore support until UrMall support tickets are added.
                </p>
              </div>
            )}

            {active === "settings" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="font-black text-gray-950">Buyer settings</p>
                  <p className="mt-1 text-sm font-medium text-gray-600">Saved products, recent views, address, and payment preferences are active in this buyer menu.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
