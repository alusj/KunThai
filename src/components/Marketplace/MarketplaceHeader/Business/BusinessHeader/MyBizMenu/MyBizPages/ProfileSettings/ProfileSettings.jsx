import { Building2, KeyRound, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import BusinessInfo from "./BusinessInfo/BusinessInfo";
import ChangePassword from "./ChangePassword/ChangePassword";
import EditProfile from "./EditProfile/EditProfile";

export default function ProfileSettings({ initialView = "menu", onBack }) {
  const [currentView, setCurrentView] = useState(initialView);

  useEffect(() => {
    setCurrentView(initialView);
  }, [initialView]);

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Profile" onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
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

      {currentView === "edit" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <EditProfile onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "business" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BusinessInfo onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "password" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <ChangePassword onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}
    </div>
  );
}
