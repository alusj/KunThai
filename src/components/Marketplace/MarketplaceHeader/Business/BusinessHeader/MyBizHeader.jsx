import { useState } from "react";

import { useSellerHeader } from "../../../../../Backend/hooks/useSellerHeader";
import MyBizMenu from "./MyBizMenu/MyBizMenu";
import SellerHeaderActions from "./SellerHeaderActions";
import SellerHeaderTitle from "./SellerHeaderTitle";
import SellerSearch from "./SellerSearch";

export default function MyBizHeader({ onBack, onAddProduct }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sellerHeader = useSellerHeader();

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <SellerHeaderTitle onBack={onBack} />

          <SellerSearch
            query={sellerHeader.query}
            onQueryChange={sellerHeader.setQuery}
            results={sellerHeader.searchResults}
          />

          <SellerHeaderActions
            messageCount={sellerHeader.messageCount}
            notificationCount={sellerHeader.notificationCount}
            orderCount={sellerHeader.orderCount}
            onAddProduct={onAddProduct}
            onMessages={() => console.log("Messages")}
            onNotifications={() => console.log("Alerts")}
            onOrders={() => console.log("View orders")}
            onMenu={() => setMenuOpen(true)}
          />
        </div>
      </header>

      <MyBizMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
