import { useEffect, useState } from "react";
import { Truck } from "lucide-react";

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./SearchButton";
import NotificationButton from "./NotificationButton"
import MenuButton from "./MenuButton";
import Radar from "./Radar";
import TransportMenuDrawer from "./TransportMenuDrawer";
import PremiumHeader from "../../shared/PremiumHeader";

export default function Header({
  companyAccount,
  companyLoading = false,
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
  const hasCompanyAccount = Boolean(companyAccount?.id || companyAccount?.companyName || companyAccount?.companyCode);
  const accountLoading = operatorLoading || companyLoading;

  useEffect(() => {
    onActivityChange?.(menuOpen || searchOpen || notificationsOpen || radarOpen);
    return () => onActivityChange?.(false);
  }, [menuOpen, notificationsOpen, onActivityChange, radarOpen, searchOpen]);

  return (
    <>
      <PremiumHeader
        accent="emerald"
        centerIcon={Truck}
        title="Transport"
        left={(
          <>
            {accountLoading ? (
              <div className="h-11 w-28 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading transport account" />
            ) : (
              <OperatorButton
                hasCompanyAccount={hasCompanyAccount}
                hasOperatorAccount={hasOperatorAccount}
                onClick={onRegisterFleet}
              />
            )}
            <Radar onOpenChange={setRadarOpen} onViewFleet={onViewFleet} />
          </>
        )}
        right={(
          <>
            <SearchButton onOpenChange={setSearchOpen} onViewFleet={onViewFleet} />
            <NotificationButton
              operatorAccount={operatorAccount}
              onOpenChange={setNotificationsOpen}
              onViewFleet={onViewFleet}
            />
            <MenuButton onClick={() => setMenuOpen(true)} />
          </>
        )}
      />

      <TransportMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onViewFleet={onViewFleet}
      />
    </>
  );
}
