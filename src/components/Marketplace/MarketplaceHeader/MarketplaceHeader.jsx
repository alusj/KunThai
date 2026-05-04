import { MessageCircle, PackageCheck, Store } from "lucide-react";
import Cart from "./Cart/Cart";
import Menu from "./Menu/Menu";

export default function MarketplaceHeader({ onMyBizClick, onOrdersClick, onMessagesClick, activeUtility }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-white">
      <div className="flex h-14 items-center justify-between px-4">
        <button onClick={onMyBizClick} className="flex items-center gap-2 text-sm font-semibold">
          <Store size={17} />
          MyBiz
        </button>

        <span className="text-sm font-bold text-gray-500">Marketplace</span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOrdersClick}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition ${
              activeUtility === "orders" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
            aria-label="Open orders"
          >
            <PackageCheck size={18} />
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
