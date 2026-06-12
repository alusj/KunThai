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
import { fetchActiveTrips, fetchSavedOperators } from "../../services/passengerTransportService";
import {
  fetchTransportFleets,
  subscribeToFleetUpdates,
} from "../../services/transportFleetService";
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
}) {
  const [movementFilters, setMovementFilters] = useState({
    mode: "topRated",
    fleetType: null,
    activeOnly: false,
    verifiedOnly: false,
  });
  const [summary, setSummary] = useState({
    loading: true,
    topRatedCount: 0,
    activeTripsCount: 0,
    savedOperatorsCount: 0,
  });

  useEffect(() => {
    let alive = true;

    async function loadSummary() {
      try {
        const [fleets, trips, saved] = await Promise.all([
          fetchTransportFleets({ mode: "topRated", fleetType: null }),
          fetchActiveTrips(),
          fetchSavedOperators(),
        ]);

        if (alive) {
          setSummary({
            loading: false,
            topRatedCount: fleets.length,
            activeTripsCount: trips.length,
            savedOperatorsCount: saved.length,
          });
        }
      } catch {
        if (alive) {
          setSummary((current) => ({ ...current, loading: false }));
        }
      }
    }

       loadSummary();

    const unsubscribe = subscribeToFleetUpdates(async (fleets) => {
      try {
        const [trips, saved] = await Promise.all([
          fetchActiveTrips(),
          fetchSavedOperators(),
        ]);

        if (alive) {
          setSummary({
            loading: false,
            topRatedCount: fleets.length,
            activeTripsCount: trips.length,
            savedOperatorsCount: saved.length,
          });
        }
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  function updateMovementFilters(patch) {
    setMovementFilters((current) => ({ ...current, ...patch }));
  }

  function getMovementSelection() {
    const mode = movementFilters.mode || "topRated";
    const fleetType = movementFilters.fleetType || null;
    const label = movementFilters.label || (
      mode === "ride"
        ? fleetType || "Ride Fleets"
        : mode === "delivery"
          ? fleetType || "Delivery Fleets"
          : "All Registered Fleets"
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
