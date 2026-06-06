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
import PassengerLiveTripHeaderCard from "./live/PassengerLiveTripHeaderCard";
import { getOperatorAccount } from "../services/transportOperatorAccountService";
import { submitTransportSupportTicket } from "../services/bookingService";

export default function Transport({ onActivityChange, areaViewRequest = null }) {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationAreaPreviewOpen, setRegistrationAreaPreviewOpen] = useState(false);
  const [operatorAccount, setOperatorAccount] = useState(null);
  const [operatorLoading, setOperatorLoading] = useState(true);
  const [operatorError, setOperatorError] = useState("");
  const [operatorDashboardOpen, setOperatorDashboardOpen] = useState(false);
  const [operatorDashboardClosing, setOperatorDashboardClosing] = useState(false);
  const [operatorDashboardView, setOperatorDashboardView] = useState("dashboard");
  const [fleetSelection, setFleetSelection] = useState(null);
  const [activeFleetId, setActiveFleetId] = useState(null);
  const [activeTripsOpen, setActiveTripsOpen] = useState(false);
  const [activeTripsActionRequest, setActiveTripsActionRequest] = useState(null);
  const [nearbyAreaOpen, setNearbyAreaOpen] = useState(false);
  const [nearbyAreaRequest, setNearbyAreaRequest] = useState(null);
  const [savedOperatorsOpen, setSavedOperatorsOpen] = useState(false);
  const [verificationFleet, setVerificationFleet] = useState(null);
  const [bookingTarget, setBookingTarget] = useState(null);
  const [headerActivityOpen, setHeaderActivityOpen] = useState(false);
  const [routeDirection, setRouteDirection] = useState("forward");
  const operatorDashboardCloseTimer = useRef(null);

  const routePanelClass = routeDirection === "backward" ? "kt-explore-stack-enter-left" : "kt-explore-stack-enter";

  function handleBookingCreated() {
    setBookingTarget(null);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsActionRequest(null);
    setNearbyAreaOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    setRouteDirection("forward");
    setActiveTripsOpen(true);
  }

  function openOperatorDashboard(view = "dashboard") {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }

    setOperatorDashboardClosing(false);
    setOperatorDashboardView(view);
    setRouteDirection("forward");
    setOperatorDashboardOpen(true);
  }

  function closeOperatorDashboard() {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
    }

    setOperatorDashboardClosing(true);
    setRouteDirection("backward");
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

    setRouteDirection("forward");
    setRegistrationAreaPreviewOpen(false);
    setRegistrationOpen(false);
    setOperatorDashboardOpen(false);
    setOperatorDashboardClosing(false);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    const returnToBooking = options.returnTo === "booking";
    const bookingSnapshot = returnToBooking ? options.bookingTarget || bookingTarget : null;
    setBookingTarget(null);
    setNearbyAreaRequest(
      destination
        ? {
            destination,
            autoRoute: options.autoRoute ?? true,
            returnTo: returnToBooking ? "booking" : "",
            bookingTarget: bookingSnapshot,
          }
        : null,
    );
    setNearbyAreaOpen(true);
  }

  function openRegistrationOneKmPreview() {
    setRouteDirection("forward");
    setRegistrationAreaPreviewOpen(true);
  }

  function closeRegistrationOneKmPreview() {
    setRouteDirection("backward");
    setRegistrationAreaPreviewOpen(false);
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
    setRouteDirection("forward");
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
    setRouteDirection("forward");
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

  async function handleReportVerificationConcern(fleetOrPayload, maybePayload) {
    const fleet = maybePayload ? fleetOrPayload : verificationFleet;
    const payload = maybePayload || fleetOrPayload || {};

    if (!fleet) {
      throw new Error("Select the operator again so KunThai can attach the correct fleet record.");
    }

    const reason = payload.reason || "Verification concern";
    const message = String(payload.message || "").trim();
    const supportBody = [
      `Reason: ${reason}`,
      `Operator: ${fleet.operatorName || fleet.fleetName || "Transport operator"}`,
      `Fleet: ${fleet.fleetName || "Fleet name unavailable"}`,
      `Fleet ID: ${fleet.id || "Unavailable"}`,
      `Operator record: ${fleet.operatorRecordId || "Unavailable"}`,
      `Display code: ${fleet.operatorId || "Unavailable"}`,
      `Plate: ${fleet.plateNumber || "Unavailable"}`,
      `Verification status: ${fleet.verificationStatus || "Unknown"}`,
      "",
      message,
    ].join("\n");

    return submitTransportSupportTicket({
      fleetId: fleet.id || fleet.operatorRecordId || "",
      topic: "Operator verification concern",
      priority: reason === "Safety concern" ? "high" : "normal",
      body: supportBody,
    });
  }

  useEffect(() => {
    let alive = true;

    async function loadOperatorAccount() {
      try {
        setOperatorError("");
        const account = await getOperatorAccount();
        if (alive) setOperatorAccount(account);
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
    setRegistrationAreaPreviewOpen(false);
    setRouteDirection("forward");
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
        registrationAreaPreviewOpen ||
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
    registrationAreaPreviewOpen,
    savedOperatorsOpen,
    verificationFleet,
  ]);

  if (registrationAreaPreviewOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <NearbyAreaScreen
          onBack={closeRegistrationOneKmPreview}
          onDone={closeRegistrationOneKmPreview}
          mode="oneKmPreview"
          backLabel="Back to price form"
        />
      </div>
    );
  }

  if (registrationOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <FleetRegistrationDrawer
          onClose={() => {
            setRouteDirection("backward");
            setRegistrationOpen(false);
          }}
          onViewOneKmPreview={openRegistrationOneKmPreview}
          onComplete={(account) => {
            setOperatorAccount(account);
            setRegistrationOpen(false);
            setRouteDirection("forward");
            setOperatorDashboardOpen(true);
          }}
        />
      </div>
    );
  }

  if (operatorDashboardOpen && operatorAccount) {
    return (
      <div className={`${operatorDashboardClosing ? "kt-explore-stack-leave-right" : "kt-explore-stack-enter"} min-h-screen`}>
        <OperatorDashboardScreen
          account={operatorAccount}
          initialView={operatorDashboardView}
          onBack={closeOperatorDashboard}
          onAccountUpdate={setOperatorAccount}
          onLocateArea={openNearbyAreaRoute}
          onEditRegistration={() => {
            setRouteDirection("forward");
            setOperatorDashboardOpen(false);
            setRegistrationOpen(true);
          }}
        />
      </div>
    );
  }

  if (nearbyAreaOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <NearbyAreaScreen
          onBack={() => {
            const returnToBooking = nearbyAreaRequest?.returnTo === "booking" && nearbyAreaRequest?.bookingTarget;
            setRouteDirection("backward");
            setNearbyAreaOpen(false);
            if (returnToBooking) {
              setBookingTarget(nearbyAreaRequest.bookingTarget);
            }
            setNearbyAreaRequest(null);
          }}
          initialDestination={nearbyAreaRequest?.destination}
          autoRoute={Boolean(nearbyAreaRequest?.autoRoute)}
          backLabel={nearbyAreaRequest?.returnTo === "booking" ? "Back to booking form" : "Back to transport"}
        />
      </div>
    );
  }

  if (activeFleetId) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <FleetProfileScreen
          fleetId={activeFleetId}
          onBack={() => {
            setRouteDirection("backward");
            setActiveFleetId(null);
          }}
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
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (activeTripsOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <ActiveTripsScreen
          initialActionRequest={activeTripsActionRequest}
          onBack={() => {
            setRouteDirection("backward");
            setActiveTripsOpen(false);
            setActiveTripsActionRequest(null);
          }}
          onViewFleet={(fleetId) => {
            setRouteDirection("forward");
            setActiveFleetId(fleetId);
          }}
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
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (savedOperatorsOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <SavedOperatorsScreen
          onBack={() => {
            setRouteDirection("backward");
            setSavedOperatorsOpen(false);
          }}
          onViewFleet={(fleetId) => {
            setRouteDirection("forward");
            setActiveFleetId(fleetId);
          }}
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
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (fleetSelection) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <FleetListScreen
          selection={fleetSelection}
          onBack={() => {
            setRouteDirection("backward");
            setFleetSelection(null);
          }}
          onViewFleet={(fleetId) => {
            setRouteDirection("forward");
            setActiveFleetId(fleetId);
          }}
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
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  return (
    <div className={`${routeDirection === "backward" ? "kt-explore-stack-enter-left" : ""} min-h-screen bg-gray-50 relative`}>
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
          setRouteDirection("forward");
        }}
      />
      <PassengerLiveTripHeaderCard
        onOpenTrips={(request) => {
          setActiveTripsActionRequest(request || null);
          setRouteDirection("forward");
          setActiveTripsOpen(true);
        }}
      />
      {operatorError && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {operatorError}
        </div>
      )}
      <Body
        onSelectFleetType={(mode, fleetType, label) => {
          setRouteDirection("forward");
          setFleetSelection({ mode, fleetType, label });
        }}
        onOpenTopRated={() => {
          setRouteDirection("forward");
          setFleetSelection({ mode: "topRated", fleetType: null, label: "Top Rated Fleets" });
        }}
        onOpenNearbyArea={() => {
          openNearbyAreaRoute();
        }}
        onOpenActiveTrips={() => {
          setActiveTripsActionRequest(null);
          setRouteDirection("forward");
          setActiveTripsOpen(true);
        }}
        onOpenSavedOperators={() => {
          setRouteDirection("forward");
          setSavedOperatorsOpen(true);
        }}
        onViewFleet={(fleetId) => {
          setRouteDirection("forward");
          setActiveFleetId(fleetId);
        }}
        onOpenBooking={(target) => setBookingTarget(target)}
        onLocateArea={openNearbyAreaRoute}
        onReportConcern={handleReportVerificationConcern}
      />
      {renderBookingDrawer()}
    </div>
  );
}
