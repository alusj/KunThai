import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./SearchButton";
import NotificationButton from "./NotificationButton"
import MenuButton from "./MenuButton";
import Radar from "./Radar";
import TransportMenuDrawer from "./TransportMenuDrawer";
import PremiumHeader from "../../shared/PremiumHeader";
import CenteredModal from "../../shared/CenteredModal";
import {
  subscribeNotificationSeen,
} from "../../../Backend/services/notificationSeenStore";
import { fetchTransportOperationBadgeState } from "../../services/transportHeaderService";
import { useI18n, t } from "../../../i18n";

export default function Header({
  companyAccount,
  companyLoading = false,
  operatorAccount,
  operatorLoading = false,
  onActivityChange,
  onNotificationCountChange,
  onRegisterFleet,
  onViewFleet,
  onViewTrip,
  onOpenEmergencyArea,
}) {
  useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [radarOpen, setRadarOpen] = useState(false);
  const [passengerNotificationCount, setPassengerNotificationCount] = useState(0);
  const [operatorActivity, setOperatorActivity] = useState({ bookingCount: 0, notificationCount: 0, totalCount: 0, bookingItems: [] });
  const [fleetPickerOpen, setFleetPickerOpen] = useState(false);
  const operatorBadgeCount = operatorActivity.totalCount;

  // Booking-carrying fleets, deduped, so a booked operator can jump straight to
  // the fleet that needs action even when they run fleets across companies.
  const bookedFleets = (() => {
    const seen = new Map();
    for (const item of operatorActivity.bookingItems || []) {
      if (!item?.fleetId) continue;
      const existing = seen.get(item.fleetId);
      if (existing) existing.count += 1;
      else seen.set(item.fleetId, { fleetId: item.fleetId, fleetName: item.fleetName || t("urride.header.fleetFallback"), count: 1 });
    }
    return Array.from(seen.values());
  })();

  function handleOperatorOpen() {
    // The operator icon must open the operator's OWN surface (their operator
    // dashboard, or company workspace) so they can see and manage bookings.
    // onRegisterFleet already routes: operatorAccount -> operator dashboard,
    // companyAccount -> company workspace, neither -> registration chooser.
    //
    // It must NEVER route through onViewFleet: that opens the passenger-facing
    // FleetProfileScreen, which is exactly the "viewing as a passenger" bug an
    // operator hit after a passenger booked their ride.
    onRegisterFleet?.();
  }
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
    // Events below drive live updates; this interval is only a missed-event
    // backstop, so it can run infrequently to save Egress.
    intervalId = window.setInterval(refreshOperatorBadge, 60000);
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
              // Show a skeleton shaped exactly like the operator button (a
              // pulsing rounded-square) instead of a blank gap, so the header
              // reads as loading the same way the dashboard does rather than
              // popping the icon in once the account resolves.
              <div
                className="kt-premium-icon-button kt-premium-icon-button-square animate-pulse border-slate-200 bg-slate-200/70"
                aria-hidden="true"
              />
            ) : (
              <OperatorButton
                badge={operatorBadgeCount}
                hasCompanyAccount={hasCompanyAccount}
                hasOperatorAccount={hasOperatorAccount}
                onClick={handleOperatorOpen}
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
              onViewTrip={onViewTrip}
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

      <CenteredModal open={fleetPickerOpen} onClose={() => setFleetPickerOpen(false)} maxWidth="max-w-sm" labelledBy="fleet-picker-title">
        <h2 id="fleet-picker-title" className="text-lg font-black text-slate-950">{t("urride.header.openBookedFleetTitle")}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{t("urride.header.openBookedFleetBody")}</p>
        <div className="mt-4 space-y-2">
          {bookedFleets.map((fleet) => (
            <button
              key={fleet.fleetId}
              type="button"
              onClick={() => {
                setFleetPickerOpen(false);
                onViewFleet?.(fleet.fleetId);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
            >
              <span className="min-w-0 truncate text-sm font-black text-slate-950">{fleet.fleetName}</span>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-black text-white">{fleet.count}</span>
            </button>
          ))}
        </div>
      </CenteredModal>
    </>
  );
}
