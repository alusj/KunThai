import Cart from "./Cart/Cart";
import Menu from "./Menu/Menu";

export default function MarketplaceHeader({ onMyBizClick }) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b">
      <div className="flex items-center justify-between h-14 px-4">

        {/* =======================
            LEFT: MyBiz
        ======================= */}
        <button
          onClick={onMyBizClick}
          className="flex items-center gap-2 font-semibold text-sm"
        >
          🏪 MyBiz
        </button>

        {/* =======================
            CENTER
        ======================= */}
        <span className="text-sm text-gray-500">
          Marketplace
        </span>

        {/* =======================
            RIGHT
        ======================= */}
        <div className="flex items-center gap-4">
          <Cart />
          <Menu />
        </div>

      </div>
    </header>
  );
}
