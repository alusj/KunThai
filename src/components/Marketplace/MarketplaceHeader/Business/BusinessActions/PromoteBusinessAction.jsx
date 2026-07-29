import { Megaphone } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import ActionButton from "./ActionButton";

export default function PromoteBusinessAction({ onClick }) {
  useI18n();
  return (
    <ActionButton
      icon={<Megaphone size={20} strokeWidth={2.4} />}
      label={t("urmall.biz.act.promoteBusiness")}
      onClick={onClick}
    />
  );
}
