// CartButton.jsx
// Header cart icon with badge

import { ShoppingCart } from "lucide-react";
import { PremiumHeaderButton } from "../../../shared/PremiumHeader";

export default function CartButton({ count, onClick }) {
  return (
    <PremiumHeaderButton
      accent="emerald"
      badge={count}
      icon={ShoppingCart}
      label="Open cart"
      onClick={onClick}
    />
  );
}
