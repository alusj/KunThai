import { Settings } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import ActionButton from "./ActionButton";

export default function ManageStoreAction({ onClick }) {
  useI18n();
  return (
    <ActionButton
      icon={<Settings size={20} strokeWidth={2.4} />}
      label={t("urmall.biz.act.manageStore")}
      onClick={onClick}
    />
  );
}
