import { useState } from "react";

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./SearchButton";
import NotificationButton from "./NotificationButton"
import MenuButton from "./MenuButton";
import Radar from "./Radar";
import TransportMenuDrawer from "./TransportMenuDrawer";

export default function Header({ operatorAccount, onRegisterFleet, onViewFleet }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasOperatorAccount = Boolean(operatorAccount);

  return (
    <>
      <header className="w-full bg-white shadow-sm px-4 py-3 flex items-center justify-between">

        {/* Left Section */}
        <div className="flex items-center gap-3">
          <OperatorButton hasOperatorAccount={hasOperatorAccount} onClick={onRegisterFleet} />
          <Radar onViewFleet={onViewFleet} />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          <SearchButton onViewFleet={onViewFleet} />
          <NotificationButton operatorAccount={operatorAccount} onViewFleet={onViewFleet} />
          <MenuButton onClick={() => setMenuOpen(true)} />
        </div>

      </header>

      <TransportMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
