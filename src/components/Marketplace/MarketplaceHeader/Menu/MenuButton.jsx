// MenuButton.jsx
// Buyer utility menu button in header

import { Menu as MenuIcon } from "lucide-react";
import { PremiumHeaderButton } from "../../../shared/PremiumHeader";

export default function MenuButton({ badge = 0, onClick }) {
  return (
    <PremiumHeaderButton badge={badge} icon={MenuIcon} label="Open buyer menu" onClick={onClick} />
  );
}
