import { Package } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import ActionButton from "./ActionButton";

export default function ViewOrdersAction({ onClick }) {
  useI18n();
  return (
    <ActionButton
      icon={<Package size={20} strokeWidth={2.4} />}
      label={t("urmall.biz.act.viewOrders")}
      onClick={onClick}
    />
  );
}
