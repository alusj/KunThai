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
}) {
  const hasNotifications = Number(notificationCount || 0) > 0;
  const activeHint = orderCount ? "orders" : messageCount ? "messages" : hasNotifications ? "alerts" : "";

  return (
    <div className="flex items-center gap-2">
      <HeaderActionButton
        icon={Plus}
        label="Add Product"
        primary
        onClick={onAddProduct}
      />
      <ActionWithHint hint="New order waiting" visible={activeHint === "orders"}>
        <HeaderActionButton
          icon={PackageCheck}
          label="Orders"
          badge={orderCount}
          onClick={onOrders}
        />
      </ActionWithHint>
      <ActionWithHint hint="New buyer message" visible={activeHint === "messages"}>
        <HeaderActionButton
          icon={MessageSquare}
          label="Messages"
          badge={messageCount}
          onClick={onMessages}
        />
      </ActionWithHint>
      {hasNotifications ? (
        <ActionWithHint hint="Seller alert" visible={activeHint === "alerts"}>
          <HeaderActionButton
            icon={Bell}
            label="Alerts"
            badge={notificationCount}
            onClick={onAlerts}
          />
        </ActionWithHint>
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

function ActionWithHint({ children, hint, visible }) {
  return (
    <div className="relative">
      {children}
      {visible ? (
        <div
          aria-hidden="true"
          className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-36 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 shadow-xl shadow-slate-900/10"
        >
          {hint}
          <span className="absolute -top-1 right-5 h-3 w-3 rotate-45 border-l border-t border-emerald-100 bg-white" />
        </div>
      ) : null}
    </div>
  );
}
