import { Building2, KeyRound, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import SettingsSubMenuItem from "../SettingsSubMenuItem";
import BusinessInfo from "./BusinessInfo/BusinessInfo";
import ChangePassword from "./ChangePassword/ChangePassword";
import EditProfile from "./EditProfile/EditProfile";

export default function ProfileSettings({ initialView = "menu" }) {
  const [currentView, setCurrentView] = useState(initialView);

  useEffect(() => {
    setCurrentView(initialView);
  }, [initialView]);

  if (currentView === "edit") {
    return <EditProfile onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "business") {
    return <BusinessInfo onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "password") {
    return <ChangePassword onBack={() => setCurrentView("menu")} />;
  }

  return (
    <div className="space-y-3 px-4">
      <SettingsSubMenuItem
        icon={UserRound}
        title="Edit Profile"
        description="Update seller name, contact details, and account profile."
        onClick={() => setCurrentView("edit")}
      />
      <SettingsSubMenuItem
        icon={Building2}
        title="Business Information"
        description="Review the public business details buyers see."
        onClick={() => setCurrentView("business")}
      />
      <SettingsSubMenuItem
        icon={KeyRound}
        title="Change Password"
        description="Keep the seller account secure with a fresh password."
        onClick={() => setCurrentView("password")}
      />
    </div>
  );
}
