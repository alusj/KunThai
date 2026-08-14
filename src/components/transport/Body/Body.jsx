// Body.jsx
// Professional Passenger Dashboard Layout
// Radar uses floating slot system (not inside grid)

import { useEffect, useState } from "react";

import BookRide from "./BookRide/BookRide";
import SendDelivery from "./SendDelivery/SendDelivery";
import AreaView from "./AreaView";
import TopRated from "./TopRated";
import TourHistory from "./TourHistory";
import Favorite from "./Favorite";
import NearbyOperators from "./NearbyOperators";
import {
  fetchActiveTripCount,
  fetchSavedOperatorCount,
} from "../../services/passengerTransportService";
import { t } from "../../../i18n";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import {
  fetchTransportFleets,
  subscribeToFleetUpdates,
} from "../../services/transportFleetService";
import {
  readTransportDashboardSnapshot,
  writeTransportDashboardSnapshot,
} from "../../services/transportDashboardCacheService";
//import Radar from "./Radar";

export default function Body({
  onSelectFleetType,
  onOpenTopRated,
  onOpenNearbyArea,
  onOpenActiveTrips,
  onOpenSavedOperators,
  onViewFleet,
  onOpenBooking,
  onReportConcern,
  userId = "",
}) {
  const countryIso = getActiveCountryProfile().iso2 || "";
  const initialSnapshot = readTransportDashboardSnapshot({ userId, countryIso });
  const [movementFilters, setMovementFilters] = useState({
    mode: "topRated",
    fleetType: null,
    activeOnly: true,
    verifiedOnly: false,
  });
  const [summary, setSummary] = useState(() => ({
    loading: !initialSnapshot?.summary,
    topRatedCount: initialSnapshot?.summary?.topRatedCount || 0,
    activeTripsCount: initialSnapshot?.summary?.activeTripsCount || 0,
    savedOperatorsCount: initialSnapshot?.summary?.savedOperatorsCount || 0,
  }));

  useEffect(() => {
    let alive = true;
    const scope = { userId, countryIso };
    const cachedSnapshot = readTransportDashboardSnapshot(scope);

    setSummary({
      loading: !cachedSnapshot?.summary,
      topRatedCount: cachedSnapshot?.summary?.topRatedCount || 0,
      activeTripsCount: cachedSnapshot?.summary?.activeTripsCount || 0,
      savedOperatorsCount: cachedSnapshot?.summary?.savedOperatorsCount || 0,
    });

    function commitSummary(update) {
      if (!alive) return;
      setSummary((current) => {
        const next = typeof update === "function" ? update(current) : update;
        writeTransportDashboardSnapshot(scope, { summary: next });
        return next;
      });
    }

    async function loadSummary() {
      try {
        const [fleets, activeTripsCount, savedOperatorsCount] = await Promise.all([
          fetchTransportFleets({ mode: "topRated", fleetType: null, includeOffline: false }),
          fetchActiveTripCount(),
          fetchSavedOperatorCount(),
        ]);

        commitSummary({
          loading: false,
          topRatedCount: fleets.length,
          activeTripsCount,
          savedOperatorsCount,
        });
      } catch {
        if (alive) {
          setSummary((current) => ({ ...current, loading: false }));
        }
      }
    }

    async function refreshPassengerCounts() {
      try {
        const [activeTripsCount, savedOperatorsCount] = await Promise.all([
          fetchActiveTripCount({ force: true }),
          fetchSavedOperatorCount({ force: true }),
        ]);
        commitSummary((current) => ({
          ...current,
          loading: false,
          activeTripsCount,
          savedOperatorsCount,
        }));
      } catch {
        // A background refresh must never replace a usable cached snapshot.
      }
    }

    loadSummary();

    const unsubscribe = subscribeToFleetUpdates((fleets) => {
      commitSummary((current) => ({
        ...current,
        loading: false,
        topRatedCount: fleets.length,
      }));
    });
    window.addEventListener("transport-trip-updated", refreshPassengerCounts);
    window.addEventListener("transport-booking-created", refreshPassengerCounts);
    window.addEventListener("transport-saved-operator-updated", refreshPassengerCounts);

    return () => {
      alive = false;
      unsubscribe?.();
      window.removeEventListener("transport-trip-updated", refreshPassengerCounts);
      window.removeEventListener("transport-booking-created", refreshPassengerCounts);
      window.removeEventListener("transport-saved-operator-updated", refreshPassengerCounts);
    };
  }, [countryIso, userId]);

  function updateMovementFilters(patch) {
    setMovementFilters((current) => ({ ...current, ...patch }));
  }

  function getMovementSelection() {
    const mode = movementFilters.mode || "topRated";
    const fleetType = movementFilters.fleetType || null;
    const label = movementFilters.label || (
      mode === "ride"
        ? fleetType || t("urride.dashboard.rideFleets")
        : mode === "delivery"
          ? fleetType || t("urride.dashboard.deliveryFleets")
          : t("urride.dashboard.allFleets")
    );

    return {
      mode,
      fleetType,
      label,
      verifiedOnly: movementFilters.verifiedOnly,
    };
  }

  return (
    <div className="relative px-3 pt-5 pb-24">
      {/* Grid Layout */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5">

        {/* Row 1 */}
        <BookRide onSelectFleetType={onSelectFleetType} />
        <SendDelivery onSelectFleetType={onSelectFleetType} />

        {/* Row 2 */}
        <AreaView onClick={onOpenNearbyArea} />
        <TopRated onClick={onOpenTopRated} count={summary.topRatedCount} loading={summary.loading} />

        {/* Row 3 */}
        <TourHistory onClick={onOpenActiveTrips} count={summary.activeTripsCount} loading={summary.loading} />
        <Favorite onClick={onOpenSavedOperators} count={summary.savedOperatorsCount} loading={summary.loading} />

      </div>

      <NearbyOperators
        cacheScope={{ userId, countryIso }}
        filters={movementFilters}
        destination=""
        pickup=""
        onChooseVerified={() => updateMovementFilters({ verifiedOnly: true })}
        onViewAll={() => {
          const selection = getMovementSelection();
          if (selection.mode === "topRated") {
            onOpenTopRated();
            return;
          }
          onSelectFleetType(selection.mode, selection.fleetType, selection.label);
        }}
        onViewFleet={onViewFleet}
        onOpenBooking={onOpenBooking}
        onReportConcern={onReportConcern}
      />

      {/* Radar Floating In Slot Between Row 2 
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 z-30">
        <Radar />
      </div>*/}

    </div>
  );
}
