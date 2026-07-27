// MenuButton.jsx
// Buyer utility menu button in header

import { Menu as MenuIcon } from "lucide-react";
import { PremiumHeaderButton } from "../../../shared/PremiumHeader";
import { useI18n } from "../../../../i18n";

export default function MenuButton({ badge = 0, onClick }) {
  const { t } = useI18n();
  return (
    <PremiumHeaderButton badge={badge} icon={MenuIcon} label={t("urmall.menu.openMenu")} onClick={onClick} />
  );
}
