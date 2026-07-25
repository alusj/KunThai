import { Bell, Menu, MessageSquare, PackageCheck, Plus } from "lucide-react";

import HeaderActionButton from "./HeaderActionButton";

export default function SellerHeaderActions({
  orderCount,
  messageCount,
  notificationCount,
  onAddProduct,
  onOrders,
  onMessages,
  onAlerts,
  onMenu,
  primaryActionLabel = "Add Product",
  showOrders = true,
  showAddProduct = true,
  showMessages = true,
}) {
  const hasNotifications = Number(notificationCount || 0) > 0;

  return (
    <div className="flex items-center gap-2">
      {showAddProduct ?
        <HeaderActionButton
          icon={Plus}
          label={primaryActionLabel}
          primary
          onClick={onAddProduct}
        />
      : null}
      {showOrders ?
        <HeaderActionButton
          icon={PackageCheck}
          label="Orders"
          badge={orderCount}
          onClick={onOrders}
        />
      : null}
      {showMessages ?
        <HeaderActionButton
          icon={MessageSquare}
          label="Messages"
          badge={messageCount}
          onClick={onMessages}
        />
      : null}
      {hasNotifications ? (
          <HeaderActionButton
            icon={Bell}
            label="Alerts"
            badge={notificationCount}
            onClick={onAlerts}
          />
      ) : null}
      <button
        type="button"
        onClick={onMenu}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
        aria-label="Open menu"
        title="Menu"
      >
        <Menu size={20} strokeWidth={2.3} />
      </button>
    </div>
  );
}
