import { Activity, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

import SettingsSubMenuItem from "../SettingsSubMenuItem";
import ChangePassword from "./ChangePassword/ChangePassword";
import LoginActivity from "./LoginActivity/LoginActivity";
import TwoFactorAuth from "./TwoFactorsAuth/TwoFactorAuth";

export default function Security() {
  const [currentView, setCurrentView] = useState("menu");

  if (currentView === "password") {
    return <ChangePassword onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "login") {
    return <LoginActivity onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "2fa") {
    return <TwoFactorAuth onBack={() => setCurrentView("menu")} />;
  }

  return (
    <div className="space-y-3 px-4">
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
  );
}
