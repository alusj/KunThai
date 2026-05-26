import { useEffect, useRef, useState } from "react";

import Body from "./Body/Body";
import ActiveTripsScreen from "./ActiveTripsScreen";
import FleetListScreen from "./FleetListScreen";
import FleetProfileScreen from "./FleetProfileScreen";
import NearbyAreaScreen from "./NearbyAreaScreen";
import OperatorDashboardScreen from "./OperatorDashboardScreen";
import SavedOperatorsScreen from "./SavedOperatorsScreen";
import TransportBookingDrawer from "./booking/TransportBookingDrawer";
import Header from "./header/Header";
import FleetRegistrationDrawer from "./registration/FleetRegistrationDrawer";
import VerificationDetailsModal from "./verification/VerificationDetailsModal";
import { getLegacyOperatorAccount, getOperatorAccount } from "../services/transportOperatorAccountService";

export default function Transport({ onActivityChange, areaViewRequest = null }) {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [operatorAccount, setOperatorAccount] = useState(null);
  const [operatorLoading, setOperatorLoading] = useState(true);
  const [operatorError, setOperatorError] = useState("");
  const [operatorDashboardOpen, setOperatorDashboardOpen] = useState(false);
  const [operatorDashboardClosing, setOperatorDashboardClosing] = useState(false);
  const [operatorDashboardView, setOperatorDashboardView] = useState("dashboard");
  const [fleetSelection, setFleetSelection] = useState(null);
  const [activeFleetId, setActiveFleetId] = useState(null);
  const [activeTripsOpen, setActiveTripsOpen] = useState(false);
  const [nearbyAreaOpen, setNearbyAreaOpen] = useState(false);
  const [nearbyAreaRequest, setNearbyAreaRequest] = useState(null);
  const [savedOperatorsOpen, setSavedOperatorsOpen] = useState(false);
  const [verificationFleet, setVerificationFleet] = useState(null);
  const [bookingTarget, setBookingTarget] = useState(null);
  const [headerActivityOpen, setHeaderActivityOpen] = useState(false);
  const operatorDashboardCloseTimer = useRef(null);

  function handleBookingCreated() {
    setBookingTarget(null);
    setFleetSelection(null);
    setActiveFleetId(null);
    setNearbyAreaOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    setActiveTripsOpen(true);
  }

  function openOperatorDashboard(view = "dashboard") {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }

    setOperatorDashboardClosing(false);
    setOperatorDashboardView(view);
    setOperatorDashboardOpen(true);
  }

  function closeOperatorDashboard() {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
    }

    setOperatorDashboardClosing(true);
    operatorDashboardCloseTimer.current = window.setTimeout(() => {
      setOperatorDashboardOpen(false);
      setOperatorDashboardClosing(false);
      operatorDashboardCloseTimer.current = null;
    }, 240);
  }

  function openNearbyAreaRoute(destination = null, options = {}) {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }

    setRegistrationOpen(false);
    setOperatorDashboardOpen(false);
    setOperatorDashboardClosing(false);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    setBookingTarget(null);
    setNearbyAreaRequest(
      destination
        ? {
            destination,
            autoRoute: options.autoRoute ?? true,
          }
        : null,
    );
    setNearbyAreaOpen(true);
  }

  function renderBookingDrawer() {
    return (
      <TransportBookingDrawer
        open={Boolean(bookingTarget)}
        target={bookingTarget}
        onClose={() => setBookingTarget(null)}
        onCreated={handleBookingCreated}
        onLocateArea={openNearbyAreaRoute}
      />
    );
  }

  function handleViewVerificationProfile() {
    if (!verificationFleet?.id) return;
    setActiveFleetId(verificationFleet.id);
    setFleetSelection(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
  }

  function handleChooseVerifiedOperators() {
    setVerificationFleet(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setFleetSelection({
      mode: "topRated",
      fleetType: null,
      label: "Verified Operators",
      verifiedOnly: true,
    });
  }

  function handleContinueWithVerification() {
    setVerificationFleet(null);
  }

  function handleBookVerificationFleet() {
    if (!verificationFleet) return;
    setBookingTarget({ fleet: verificationFleet });
  }

  useEffect(() => {
    let alive = true;

    async function loadOperatorAccount() {
      try {
        setOperatorError("");
        const account = await getOperatorAccount();
        if (alive) setOperatorAccount(account || getLegacyOperatorAccount());
      } catch (error) {
        if (alive) setOperatorError(error.message || "Unable to load fleet account.");
      } finally {
        if (alive) setOperatorLoading(false);
      }
    }

    loadOperatorAccount();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (operatorDashboardCloseTimer.current) {
        window.clearTimeout(operatorDashboardCloseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!areaViewRequest?.destination) return;

    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }
    setRegistrationOpen(false);
    setOperatorDashboardOpen(false);
    setOperatorDashboardClosing(false);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    setBookingTarget(null);
    setNearbyAreaRequest(areaViewRequest);
    setNearbyAreaOpen(true);
  }, [areaViewRequest]);

  useEffect(() => {
    onActivityChange?.(
      registrationOpen ||
        operatorDashboardOpen ||
        Boolean(fleetSelection) ||
        Boolean(activeFleetId) ||
        activeTripsOpen ||
        nearbyAreaOpen ||
        savedOperatorsOpen ||
        Boolean(verificationFleet) ||
        Boolean(bookingTarget) ||
        headerActivityOpen,
    );

    return () => onActivityChange?.(false);
  }, [
    activeFleetId,
    activeTripsOpen,
    bookingTarget,
    fleetSelection,
    headerActivityOpen,
    nearbyAreaOpen,
    onActivityChange,
    operatorDashboardOpen,
    registrationOpen,
    savedOperatorsOpen,
    verificationFleet,
  ]);

  if (registrationOpen) {
    return (
      <div className="kt-route-transition min-h-screen">
        <FleetRegistrationDrawer
          onClose={() => setRegistrationOpen(false)}
          onComplete={(account) => {
            setOperatorAccount(account);
            setRegistrationOpen(false);
            setOperatorDashboardOpen(true);
          }}
        />
      </div>
    );
  }

  if (operatorDashboardOpen && operatorAccount) {
    return (
      <div className={`${operatorDashboardClosing ? "kt-route-zoom-close" : "kt-route-zoom-open"} min-h-screen`}>
        <OperatorDashboardScreen
          account={operatorAccount}
          initialView={operatorDashboardView}
          onBack={closeOperatorDashboard}
          onAccountUpdate={setOperatorAccount}
          onLocateArea={openNearbyAreaRoute}
          onEditRegistration={() => {
            setOperatorDashboardOpen(false);
            setRegistrationOpen(true);
          }}
        />
      </div>
    );
  }

  if (nearbyAreaOpen) {
    return (
      <div className="kt-route-transition min-h-screen">
        <NearbyAreaScreen
          onBack={() => {
            setNearbyAreaOpen(false);
            setNearbyAreaRequest(null);
          }}
          initialDestination={nearbyAreaRequest?.destination}
          autoRoute={Boolean(nearbyAreaRequest?.autoRoute)}
        />
      </div>
    );
  }

  if (activeFleetId) {
    return (
      <div className="kt-route-transition min-h-screen">
        <FleetProfileScreen
          fleetId={activeFleetId}
          onBack={() => setActiveFleetId(null)}
          onShowVerification={setVerificationFleet}
          onOpenBooking={(target) => setBookingTarget(target)}
          onLocateArea={openNearbyAreaRoute}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (activeTripsOpen) {
    return (
      <div className="kt-route-transition min-h-screen">
        <ActiveTripsScreen
          onBack={() => setActiveTripsOpen(false)}
          onViewFleet={setActiveFleetId}
          onShowVerification={setVerificationFleet}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (savedOperatorsOpen) {
    return (
      <div className="kt-route-transition min-h-screen">
        <SavedOperatorsScreen
          onBack={() => setSavedOperatorsOpen(false)}
          onViewFleet={setActiveFleetId}
          onShowVerification={setVerificationFleet}
          onOpenBooking={(target) => setBookingTarget(target)}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (fleetSelection) {
    return (
      <div className="kt-route-transition min-h-screen">
        <FleetListScreen
          selection={fleetSelection}
          onBack={() => setFleetSelection(null)}
          onViewFleet={setActiveFleetId}
          onShowVerification={setVerificationFleet}
          onOpenBooking={(target) => setBookingTarget(target)}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <Header
        operatorAccount={operatorAccount}
        operatorLoading={operatorLoading}
        onActivityChange={setHeaderActivityOpen}
        onViewFleet={setActiveFleetId}
        onRegisterFleet={() => {
          if (operatorAccount) {
            openOperatorDashboard("dashboard");
            return;
          }

          setRegistrationOpen(true);
        }}
      />
      {operatorError && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {operatorError}
        </div>
      )}
      <Body
        onSelectFleetType={(mode, fleetType, label) => {
          setFleetSelection({ mode, fleetType, label });
        }}
        onOpenTopRated={() => {
          setFleetSelection({ mode: "topRated", fleetType: null, label: "Top Rated Fleets" });
        }}
        onOpenNearbyArea={() => {
          openNearbyAreaRoute();
        }}
        onOpenActiveTrips={() => setActiveTripsOpen(true)}
        onOpenSavedOperators={() => setSavedOperatorsOpen(true)}
        onViewFleet={setActiveFleetId}
        onOpenBooking={(target) => setBookingTarget(target)}
        onLocateArea={openNearbyAreaRoute}
      />
      {renderBookingDrawer()}
    </div>
  );
}
