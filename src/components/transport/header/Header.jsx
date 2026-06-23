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
  getUnseenNotificationCount,
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { fetchTransportNotifications } from "../../services/transportHeaderService";

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
  const [passengerNotificationCount, setPassengerNotificationCount] = useState(0);
  const [operatorBadgeCount, setOperatorBadgeCount] = useState(0);
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
        if (alive) setOperatorBadgeCount(0);
        return;
      }

      try {
        const items = await fetchTransportNotifications(operatorAccount, companyAccount, {
          includePassenger: false,
        });
        const operatorItems = items.filter((item) => item.type === "operator");
        const companyItems = items.filter((item) => String(item.type || "").startsWith("company_"));
        const operatorCount = operatorAccount?.id
          ? getUnseenNotificationCount(`transport:${operatorAccount.id}`, operatorItems, { unreadOnly: true })
          : 0;
        const companyCount = companyAccount?.id
          ? getUnseenNotificationCount(`transport:${companyAccount.id}`, companyItems, { unreadOnly: true })
          : 0;

        if (alive) setOperatorBadgeCount(operatorCount + companyCount);
      } catch {
        if (alive) setOperatorBadgeCount(0);
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
        title="Transport"
        left={(
          <>
            {accountLoading ? (
              <div className="h-11 w-28 animate-pulse rounded-2xl bg-gray-100" aria-label="Loading transport account" />
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
