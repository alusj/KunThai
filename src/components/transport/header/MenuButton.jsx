import { Menu } from "lucide-react";

import { PremiumHeaderButton } from "../../shared/PremiumHeader";

export default function MenuButton({ onClick }) {
  return (
    <PremiumHeaderButton icon={Menu} label="Open transport menu" onClick={onClick} />
  );
}
