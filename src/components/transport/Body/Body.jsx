// Body.jsx
// Professional Passenger Dashboard Layout
// Radar uses floating slot system (not inside grid)

import { useEffect, useState } from "react";

import BookRide from "./BookRide/BookRide";
import SendDelivery from "./SendDelivery/SendDelivery";
import LocationSearch from "./LocationSearch";
import AreaView from "./AreaView";
import TopRated from "./TopRated";
import TourHistory from "./TourHistory";
import Favorite from "./Favorite";
import NearbyOperators from "./NearbyOperators";
import { fetchActiveTrips, fetchSavedOperators, getTransportSavedPlaces } from "../../services/passengerTransportService";
import { fetchTransportFleets } from "../../services/transportFleetService";
//import Radar from "./Radar";

export default function Body({
  onSelectFleetType,
  onOpenTopRated,
  onOpenNearbyArea,
  onOpenActiveTrips,
  onOpenSavedOperators,
  onViewFleet,
  onOpenBooking,
}) {
  const [destination, setDestination] = useState("");
  const [pickup, setPickup] = useState("");
  const [nearbyStatus, setNearbyStatus] = useState("");
  const [pickupPanelOpen, setPickupPanelOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState(() => getTransportSavedPlaces());
  const [movementFilters, setMovementFilters] = useState({
    mode: "topRated",
    fleetType: null,
    activeOnly: true,
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

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function refreshSavedPlaces() {
      setSavedPlaces(getTransportSavedPlaces());
    }

    window.addEventListener("storage", refreshSavedPlaces);
    window.addEventListener("transport-saved-place-selected", refreshSavedPlaces);
    return () => {
      window.removeEventListener("storage", refreshSavedPlaces);
      window.removeEventListener("transport-saved-place-selected", refreshSavedPlaces);
    };
  }, []);

  function updateMovementFilters(patch) {
    setMovementFilters((current) => ({ ...current, ...patch }));
  }

  function handleUseNearby() {
    setNearbyStatus("");

    if (!navigator.geolocation) {
      setNearbyStatus("Location is not available on this device. Enter the pickup point manually.");
      return;
    }

    setNearbyStatus("Checking your current pickup area...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const label = `Current location (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`;
        setPickup(label);
        setNearbyStatus("Nearby operators are now filtered from your current pickup area.");
      },
      (error) => {
        setNearbyStatus(error.code === 1 ? "Location permission denied. Enter pickup manually." : "Unable to detect your location right now.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function getMovementSelection() {
    return {
      mode: movementFilters.mode,
      fleetType: movementFilters.fleetType,
      label:
        movementFilters.mode === "delivery"
          ? "Delivery operators"
          : movementFilters.mode === "ride"
            ? "Ride operators"
            : "Available operators",
    };
  }

  return (
    <div className="relative px-3 pt-5 pb-24">
      <LocationSearch
        destination={destination}
        pickup={pickup}
        filters={movementFilters}
        savedPlaces={savedPlaces}
        nearbyStatus={nearbyStatus}
        pickupPanelOpen={pickupPanelOpen}
        filterPanelOpen={filterPanelOpen}
        onDestinationChange={setDestination}
        onPickupChange={setPickup}
        onUseNearby={handleUseNearby}
        onTogglePickupPanel={() => setPickupPanelOpen((open) => !open)}
        onToggleFilterPanel={() => setFilterPanelOpen((open) => !open)}
        onFilterChange={updateMovementFilters}
        onOpenBooking={() => onOpenBooking?.({
          selection: getMovementSelection(),
          movement: { pickup, destination },
        })}
      />

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
        destination={destination}
        pickup={pickup}
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
      />

      {/* Radar Floating In Slot Between Row 2 
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 z-30">
        <Radar />
      </div>*/}

    </div>
  );
}
