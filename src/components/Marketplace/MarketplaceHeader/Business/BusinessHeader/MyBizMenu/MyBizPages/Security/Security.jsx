import { Activity, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import ChangePassword from "./ChangePassword/ChangePassword";
import LoginActivity from "./LoginActivity/LoginActivity";
import TwoFactorAuth from "./TwoFactorsAuth/TwoFactorAuth";

export default function Security({ onBack }) {
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Security" onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={KeyRound}
          title="Change Password"
          description="Update the password used to protect seller access."
          onClick={() => setCurrentView("password")}
        />
        <SettingsSubMenuItem
          icon={Activity}
          title="Login Activity"
          description="Review where and when this seller account was accessed."
          onClick={() => setCurrentView("login")}
        />
        <SettingsSubMenuItem
          icon={ShieldCheck}
          title="Two-Factor Auth"
          description="Add a second verification step for sensitive actions."
          onClick={() => setCurrentView("2fa")}
        />
      </div>

      {currentView === "password" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <ChangePassword onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "login" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <LoginActivity onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "2fa" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <TwoFactorAuth onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}
    </div>
  );
}
