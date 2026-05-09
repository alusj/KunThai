import { useEffect, useState } from "react";

import Body from "./Body/Body";
import ActiveTripsScreen from "./ActiveTripsScreen";
import FleetListScreen from "./FleetListScreen";
import FleetProfileScreen from "./FleetProfileScreen";
import NearbyAreaScreen from "./NearbyAreaScreen";
import OperatorDashboardScreen from "./OperatorDashboardScreen";
import SavedOperatorsScreen from "./SavedOperatorsScreen";
import Header from "./header/Header";
import FleetRegistrationDrawer from "./registration/FleetRegistrationDrawer";
import VerificationDetailsModal from "./verification/VerificationDetailsModal";
import { getLegacyOperatorAccount, getOperatorAccount } from "../services/transportOperatorAccountService";

export default function Transport() {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [operatorAccount, setOperatorAccount] = useState(() => getLegacyOperatorAccount());
  const [operatorLoading, setOperatorLoading] = useState(true);
  const [operatorError, setOperatorError] = useState("");
  const [operatorDashboardOpen, setOperatorDashboardOpen] = useState(false);
  const [operatorDashboardView, setOperatorDashboardView] = useState("dashboard");
  const [fleetSelection, setFleetSelection] = useState(null);
  const [activeFleetId, setActiveFleetId] = useState(null);
  const [activeTripsOpen, setActiveTripsOpen] = useState(false);
  const [nearbyAreaOpen, setNearbyAreaOpen] = useState(false);
  const [savedOperatorsOpen, setSavedOperatorsOpen] = useState(false);
  const [verificationFleet, setVerificationFleet] = useState(null);

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

  if (registrationOpen) {
    return (
      <FleetRegistrationDrawer
        onClose={() => setRegistrationOpen(false)}
        onComplete={(account) => {
          setOperatorAccount(account);
          setRegistrationOpen(false);
          setOperatorDashboardOpen(true);
        }}
      />
    );
  }

  if (operatorDashboardOpen && operatorAccount) {
    return (
      <OperatorDashboardScreen
        account={operatorAccount}
        initialView={operatorDashboardView}
        onBack={() => setOperatorDashboardOpen(false)}
        onEditRegistration={() => {
          setOperatorDashboardOpen(false);
          setRegistrationOpen(true);
        }}
      />
    );
  }

  if (nearbyAreaOpen) {
    return <NearbyAreaScreen onBack={() => setNearbyAreaOpen(false)} />;
  }

  if (activeFleetId) {
    return (
      <>
        <FleetProfileScreen
          fleetId={activeFleetId}
          onBack={() => setActiveFleetId(null)}
          onShowVerification={setVerificationFleet}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
        />
      </>
    );
  }

  if (activeTripsOpen) {
    return (
      <>
        <ActiveTripsScreen
          onBack={() => setActiveTripsOpen(false)}
          onViewFleet={setActiveFleetId}
          onShowVerification={setVerificationFleet}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
        />
      </>
    );
  }

  if (savedOperatorsOpen) {
    return (
      <>
        <SavedOperatorsScreen
          onBack={() => setSavedOperatorsOpen(false)}
          onViewFleet={setActiveFleetId}
          onShowVerification={setVerificationFleet}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
        />
      </>
    );
  }

  if (fleetSelection) {
    return (
      <>
        <FleetListScreen
          selection={fleetSelection}
          onBack={() => setFleetSelection(null)}
          onViewFleet={setActiveFleetId}
          onShowVerification={setVerificationFleet}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <Header
        operatorAccount={operatorAccount}
        onRegisterFleet={() => {
          if (operatorAccount) {
            setOperatorDashboardView("dashboard");
            setOperatorDashboardOpen(true);
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
        onOpenNearbyArea={() => setNearbyAreaOpen(true)}
        onOpenActiveTrips={() => setActiveTripsOpen(true)}
        onOpenSavedOperators={() => setSavedOperatorsOpen(true)}
        onViewFleet={setActiveFleetId}
      />
    </div>
  );
}
