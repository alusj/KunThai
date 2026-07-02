import { useSellerHeader } from "../../../../../Backend/hooks/useSellerHeader";
import SellerHeaderActions from "./SellerHeaderActions";
import SellerHeaderTitle from "./SellerHeaderTitle";
import SellerSearch from "./SellerSearch";
import BusinessSwitcher from "./BusinessSwitcher";

export default function MyBizHeader({ activeBusinessId, businesses, onAddBusiness, onBack, onAddProduct, onOrders, onMessages, onAlerts, onMenu, onSwitchBusiness, primaryActionLabel = "Add Product" }) {
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

          <BusinessSwitcher activeBusinessId={activeBusinessId} businesses={businesses} onAddBusiness={onAddBusiness} onSwitch={onSwitchBusiness} />

          <SellerHeaderActions
            orderCount={sellerHeader.orderCount}
            messageCount={sellerHeader.messageCount}
            notificationCount={sellerHeader.notificationCount}
            onAddProduct={onAddProduct}
            onOrders={() => {
              sellerHeader.markSellerSectionSeen("orders");
              onOrders?.();
            }}
            onMessages={() => {
              sellerHeader.markSellerSectionSeen("messages");
              onMessages?.();
            }}
            onAlerts={() => {
              sellerHeader.markSellerSectionSeen("notifications");
              onAlerts?.();
            }}
            onMenu={onMenu}
            primaryActionLabel={primaryActionLabel}
          />
        </div>
      </header>
    </>
  );
}
