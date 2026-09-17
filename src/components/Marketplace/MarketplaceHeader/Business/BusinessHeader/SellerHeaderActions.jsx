import { Bell, Menu, MessageSquare, PackageCheck, Plus } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import HeaderActionButton from "./HeaderActionButton";
import AiAssistButton from "../../../../ai/AiAssistButton";

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
          label={primaryActionLabel}
          primary
          onClick={onAddProduct}
        />
      : null}
      {showOrders ?
        <HeaderActionButton
          icon={PackageCheck}
          label={t("urmall.biz.header.orders")}
          badge={orderCount}
          onClick={onOrders}
        />
      : null}
      {showMessages ?
        <HeaderActionButton
          icon={MessageSquare}
          label={t("urmall.biz.header.messages")}
          badge={messageCount}
          onClick={onMessages}
        />
      : null}
      <AiAssistButton
        chat
        size="icon"
        variant="outline"
        className="rounded-lg"
        label={t("ai.seller.askAboutBusiness")}
        getRequest={() => ({ surface: "urmall", role: "seller", screen: "seller workspace" })}
      />
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
