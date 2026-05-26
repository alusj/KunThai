// MenuButton.jsx
// Buyer utility menu button in header

import { Menu as MenuIcon } from "lucide-react";
import { PremiumHeaderButton } from "../../../shared/PremiumHeader";

export default function MenuButton({ onClick }) {
  return (
    <PremiumHeaderButton icon={MenuIcon} label="Open buyer menu" onClick={onClick} />
  );
}
