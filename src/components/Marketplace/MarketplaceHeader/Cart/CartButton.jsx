// CartButton.jsx
// Header cart icon with badge

import { ShoppingCart } from "lucide-react";
import { PremiumHeaderButton } from "../../../shared/PremiumHeader";
import { useI18n } from "../../../../i18n";

export default function CartButton({ count, onClick }) {
  const { t } = useI18n();
  return (
    <PremiumHeaderButton
      accent="emerald"
      badge={count}
      icon={ShoppingCart}
      label={t("urmall.cart.openCart")}
      onClick={onClick}
    />
  );
}
