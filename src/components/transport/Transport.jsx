import { useState } from "react";

import Body from "./Body/Body";
import FleetListScreen from "./FleetListScreen";
import FleetProfileScreen from "./FleetProfileScreen";
import Header from "./header/Header";
import FleetRegistrationDrawer from "./registration/FleetRegistrationDrawer";
import VerificationDetailsModal from "./verification/VerificationDetailsModal";

export default function Transport() {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [fleetSelection, setFleetSelection] = useState(null);
  const [activeFleetId, setActiveFleetId] = useState(null);
  const [verificationFleet, setVerificationFleet] = useState(null);

  if (registrationOpen) {
    return <FleetRegistrationDrawer onClose={() => setRegistrationOpen(false)} />;
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
      <Header onRegisterFleet={() => setRegistrationOpen(true)} />
      <Body
        onSelectFleetType={(mode, fleetType, label) => {
          setFleetSelection({ mode, fleetType, label });
        }}
        onOpenTopRated={() => {
          setFleetSelection({ mode: "topRated", fleetType: null, label: "Top Rated Fleets" });
        }}
      />
    </div>
  );
}
