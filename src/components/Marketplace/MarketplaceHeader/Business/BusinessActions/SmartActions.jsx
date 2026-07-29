import { Megaphone, MessageCircle, Package, Plus, Settings } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import ActionBadge from "./ActionBadge";
import ActionButton from "./ActionButton";

export default function SmartActions({
  messageCount = 0,
  onAddProduct,
  onManageStore,
  onMessages,
  onPromote,
  onViewOrders,
  orderCount = 0,
}) {
  useI18n();
  return (
    <div className="grid grid-cols-2 gap-4">
      <ActionButton
        icon={<Plus size={20} strokeWidth={2.4} />}
        label={t("urmall.biz.act.addNewProduct")}
        onClick={onAddProduct}
      />

      <div className="relative">
        <ActionButton
          icon={<Package size={20} strokeWidth={2.4} />}
          label={t("urmall.biz.act.viewOrders")}
          onClick={onViewOrders}
        />
        {orderCount > 0 ? <ActionBadge value={orderCount} /> : null}
      </div>

      <ActionButton
        icon={<Megaphone size={20} strokeWidth={2.4} />}
        label={t("urmall.biz.act.promoteBusiness")}
        onClick={onPromote}
      />

      <ActionButton
        icon={<Settings size={20} strokeWidth={2.4} />}
        label={t("urmall.biz.act.manageStore")}
        onClick={onManageStore}
      />

      <div className="relative">
        <ActionButton
          icon={<MessageCircle size={20} strokeWidth={2.4} />}
          label={t("urmall.biz.dash.messages")}
          onClick={onMessages}
        />
        {messageCount > 0 ? <ActionBadge value={messageCount} /> : null}
      </div>
    </div>
  );
}
