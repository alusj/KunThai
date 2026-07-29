import { Plus } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import ActionButton from "./ActionButton";

export default function AddProductAction({ onClick }) {
  useI18n();
  return (
    <ActionButton
      icon={<Plus size={20} strokeWidth={2.4} />}
      label={t("urmall.biz.act.addNewProduct")}
      onClick={onClick}
    />
  );
}
