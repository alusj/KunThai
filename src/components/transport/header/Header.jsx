import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./SearchButton";
import NotificationButton from "./NotificationButton"
import MenuButton from "./MenuButton";
import Radar from "./Radar";
import TransportMenuDrawer from "./TransportMenuDrawer";
import PremiumHeader from "../../shared/PremiumHeader";

export default function Header({
  active = false,
  companyAccount,
  companyLoading = false,
  operatorAccount,
  operatorLoading = false,
  onActivityChange,
  onNotificationCountChange,
  onRegisterFleet,
  onViewFleet,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const hasOperatorAccount = Boolean(operatorAccount);
  const hasCompanyAccount = Boolean(companyAccount?.id || companyAccount?.companyName || companyAccount?.companyCode);
  const accountLoading = operatorLoading || companyLoading;
  const handleNotificationCountChange = useCallback((count) => {
    setNotificationCount(count);
    onNotificationCountChange?.(count);
  }, [onNotificationCountChange]);

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
                badge={notificationCount}
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
              active={active}
              companyAccount={companyAccount}
              operatorAccount={operatorAccount}
              onOpenChange={setNotificationsOpen}
              onUnreadCountChange={handleNotificationCountChange}
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
