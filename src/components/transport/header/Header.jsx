import { useEffect, useState } from "react";

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./SearchButton";
import NotificationButton from "./NotificationButton"
import MenuButton from "./MenuButton";
import Radar from "./Radar";
import TransportMenuDrawer from "./TransportMenuDrawer";

export default function Header({
  operatorAccount,
  operatorLoading = false,
  onActivityChange,
  onRegisterFleet,
  onViewFleet,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const hasOperatorAccount = Boolean(operatorAccount);

  useEffect(() => {
    onActivityChange?.(menuOpen || searchOpen || notificationsOpen || radarOpen);
    return () => onActivityChange?.(false);
  }, [menuOpen, notificationsOpen, onActivityChange, radarOpen, searchOpen]);

  return (
    <>
      <header className="kt-header-glass flex w-full items-center justify-between px-4 py-3">

        {/* Left Section */}
        <div className="flex items-center gap-3">
          {operatorLoading ? (
            <div className="h-10 w-10 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading operator account" />
          ) : (
            <OperatorButton hasOperatorAccount={hasOperatorAccount} onClick={onRegisterFleet} />
          )}
          <Radar onOpenChange={setRadarOpen} onViewFleet={onViewFleet} />
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4">
          <SearchButton onOpenChange={setSearchOpen} onViewFleet={onViewFleet} />
          <NotificationButton
            operatorAccount={operatorAccount}
            onOpenChange={setNotificationsOpen}
            onViewFleet={onViewFleet}
          />
          <MenuButton onClick={() => setMenuOpen(true)} />
        </div>

      </header>

      <TransportMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onViewFleet={onViewFleet}
      />
    </>
  );
}
