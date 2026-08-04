import { Menu } from "lucide-react";

import { PremiumHeaderButton } from "../../shared/PremiumHeader";
import { useI18n, t } from "../../../i18n";

export default function MenuButton({ onClick }) {
  useI18n();
  return (
    <PremiumHeaderButton icon={Menu} label={t("urride.header.openMenu")} onClick={onClick} />
  );
}
