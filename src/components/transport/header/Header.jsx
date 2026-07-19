import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./SearchButton";
import NotificationButton from "./NotificationButton"
import MenuButton from "./MenuButton";
import Radar from "./Radar";
import TransportMenuDrawer from "./TransportMenuDrawer";
import PremiumHeader from "../../shared/PremiumHeader";
import {
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { fetchTransportOperationBadgeState } from "../../services/transportHeaderService";

export default function Header({
  companyAccount,
  companyLoading = false,
  operatorAccount,
  operatorLoading = false,
  onActivityChange,
  onNotificationCountChange,
  onRegisterFleet,
  onViewFleet,
  onOpenEmergencyArea,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const [passengerNotificationCount, setPassengerNotificationCount] = useState(0);
  const [operatorActivity, setOperatorActivity] = useState({ bookingCount: 0, notificationCount: 0, totalCount: 0 });
  const operatorBadgeCount = operatorActivity.totalCount;
  const hasOperatorAccount = Boolean(operatorAccount);
  const hasCompanyAccount = Boolean(companyAccount?.id || companyAccount?.companyName || companyAccount?.companyCode);
  const accountLoading = operatorLoading || companyLoading;
  const handleNotificationCountChange = useCallback((count) => {
    setPassengerNotificationCount(Number(count || 0));
  }, []);

  useEffect(() => {
    onNotificationCountChange?.(passengerNotificationCount + operatorBadgeCount);
  }, [onNotificationCountChange, operatorBadgeCount, passengerNotificationCount]);

  useEffect(() => {
    let alive = true;
    let intervalId = null;

    async function refreshOperatorBadge() {
      if (!operatorAccount?.id && !companyAccount?.id) {
        if (alive) setOperatorActivity({ bookingCount: 0, notificationCount: 0, totalCount: 0 });
        return;
      }

      try {
        const state = await fetchTransportOperationBadgeState(operatorAccount, companyAccount);
        if (alive) setOperatorActivity(state);
      } catch {
        if (alive) setOperatorActivity({ bookingCount: 0, notificationCount: 0, totalCount: 0 });
      }
    }

    refreshOperatorBadge();
    intervalId = window.setInterval(refreshOperatorBadge, 20000);
    const unsubscribeSeen = subscribeNotificationSeen(refreshOperatorBadge);
    window.addEventListener("transport-trip-updated", refreshOperatorBadge);
    window.addEventListener("transport-booking-created", refreshOperatorBadge);

    return () => {
      alive = false;
      if (intervalId) window.clearInterval(intervalId);
      unsubscribeSeen?.();
      window.removeEventListener("transport-trip-updated", refreshOperatorBadge);
      window.removeEventListener("transport-booking-created", refreshOperatorBadge);
    };
  }, [companyAccount, operatorAccount]);

  useEffect(() => {
    onActivityChange?.(menuOpen || searchOpen || notificationsOpen || radarOpen);
    return () => onActivityChange?.(false);
  }, [menuOpen, notificationsOpen, onActivityChange, radarOpen, searchOpen]);

  return (
    <>
      <PremiumHeader
        accent="emerald"
        centerIcon={Truck}
        title="UrRide"
        left={(
          <>
            {accountLoading ? (
              <div className="h-11 w-28" aria-hidden="true" />
            ) : (
              <OperatorButton
                badge={operatorBadgeCount}
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
        onOpenEmergencyArea={onOpenEmergencyArea}
      />
    </>
  );
}
