import { MessageCircle, PackageCheck, ShoppingBag, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { useSellerBusinessStatus } from "../../../Backend/hooks/useSellerBusinessStatus";
import { fetchBuyerOrders } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import Cart from "./Cart/Cart";
import Menu from "./Menu/Menu";

export default function MarketplaceHeader({ onMyBizClick, onOrdersClick, onMessagesClick, activeUtility }) {
  const { loading, hasBusiness } = useSellerBusinessStatus();
  const [orderCount, setOrderCount] = useState(0);
  const businessLabel = hasBusiness ? "MyBiz" : "REGISTER";

  useEffect(() => {
    let alive = true;

    async function loadOrderCount() {
      try {
        const orders = await fetchBuyerOrders();
        if (alive) setOrderCount(orders.length);
      } catch {
        if (alive) setOrderCount(0);
      }
    }

    loadOrderCount();
    window.addEventListener("marketplace-orders-updated", loadOrderCount);
    return () => {
      alive = false;
      window.removeEventListener("marketplace-orders-updated", loadOrderCount);
    };
  }, []);

  if (loading) {
    return (
      <header className="sticky top-0 z-20 border-b bg-white" aria-busy="true">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex h-10 w-[104px] animate-pulse items-center justify-center gap-2 rounded-lg bg-gray-100 text-gray-300">
            <Store size={18} />
            <span className="h-3 w-12 rounded-full bg-gray-200" />
          </div>

          <span className="flex flex-col items-center leading-tight text-blue-700">
            <span className="text-[11px] font-black uppercase tracking-[0.38em]">KUNTHAI</span>
            <span className="flex items-center gap-1.5 text-base font-black text-gray-900">
              <ShoppingBag size={17} />
              UrMall
            </span>
          </span>

          <div className="flex items-center gap-2" aria-hidden="true">
            {[PackageCheck, MessageCircle, ShoppingBag, Store].map((Icon, index) => (
              <span
                key={index}
                className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg bg-gray-100 text-gray-300"
              >
                <Icon size={18} />
              </span>
            ))}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-white">
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={onMyBizClick}
          className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black shadow-sm transition ${
            hasBusiness
              ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              : "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          <Store size={17} />
          {businessLabel}
        </button>

        <span className="inline-flex items-center gap-1.5 text-sm font-black text-gray-700">
          <ShoppingBag size={16} className="text-emerald-700" />
          UrMall
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOrdersClick}
            className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition ${
              activeUtility === "orders" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
            aria-label={`Open orders${orderCount ? `, ${orderCount} ordered item${orderCount === 1 ? "" : "s"}` : ""}`}
          >
            <PackageCheck size={18} />
            {orderCount ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white">
                {orderCount > 99 ? "99+" : orderCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={onMessagesClick}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition ${
              activeUtility === "messages" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
            aria-label="Open messages"
          >
            <MessageCircle size={18} />
          </button>
          <Cart />
          <Menu />
        </div>
      </div>
    </header>
  );
}
