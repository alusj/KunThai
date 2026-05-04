import { useSellerHeader } from "../../../../../Backend/hooks/useSellerHeader";
import SellerHeaderActions from "./SellerHeaderActions";
import SellerHeaderTitle from "./SellerHeaderTitle";
import SellerSearch from "./SellerSearch";

export default function MyBizHeader({ onBack, onAddProduct, onMessages, onAlerts, onMenu }) {
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
            onAddProduct={onAddProduct}
            onMessages={onMessages}
            onAlerts={onAlerts}
            onMenu={onMenu}
          />
        </div>
      </header>
    </>
  );
}
