import { useState } from "react";

import Body from "./Body/Body";
import Header from "./header/Header";
import FleetRegistrationDrawer from "./registration/FleetRegistrationDrawer";

export default function Transport() {
  const [registrationOpen, setRegistrationOpen] = useState(false);

  if (registrationOpen) {
    return <FleetRegistrationDrawer onClose={() => setRegistrationOpen(false)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <Header onRegisterFleet={() => setRegistrationOpen(true)} />
      <Body />
    </div>
  );
}
