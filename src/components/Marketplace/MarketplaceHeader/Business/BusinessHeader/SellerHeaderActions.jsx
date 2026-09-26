import { Bell, Menu, MessageSquare, PackageCheck, Plus } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import HeaderActionButton from "./HeaderActionButton";
import { uiText as translateUi } from "../../../../../i18n/index.js";

export default function SellerHeaderActions({
  orderCount,
  messageCount,
  notificationCount,
  onAddProduct,
  onOrders,
  onMessages,
  onAlerts,
  onMenu,
  primaryActionLabel = t("urmall.biz.header.addProduct"),
  showOrders = true,
  showAddProduct = true,
  showMessages = true,
}) {
  useI18n();
  return (
    <div className="flex items-center gap-2">
      {showAddProduct ?
        <HeaderActionButton
          icon={Plus}
          direction="urmall-seller-add"
          label={translateUi(primaryActionLabel)}
          primary
          onClick={onAddProduct}
        />
      : null}
      {showOrders ?
        <HeaderActionButton
          icon={PackageCheck}
          direction="urmall-seller-orders"
          label={t("urmall.biz.header.orders")}
          badge={orderCount}
          onClick={onOrders}
        />
      : null}
      {showMessages ?
        <HeaderActionButton
          icon={MessageSquare}
          direction="urmall-seller-messages"
          label={t("urmall.biz.header.messages")}
          badge={messageCount}
          onClick={onMessages}
        />
      : null}
      <HeaderActionButton
        icon={Bell}
        label={t("urmall.biz.header.alerts")}
        badge={notificationCount}
        onClick={onAlerts}
      />
      <button
        type="button"
        onClick={onMenu}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
        aria-label={t("urmall.biz.header.openMenu")}
        title={t("urmall.biz.header.menu")}
      >
        <Menu size={20} strokeWidth={2.3} />
      </button>
    </div>
  );
}
