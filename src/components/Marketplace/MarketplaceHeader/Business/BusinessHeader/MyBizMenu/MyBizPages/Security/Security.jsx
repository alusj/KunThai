import { Activity, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useI18n, t } from "../../../../../../../../i18n";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import ChangePassword from "./ChangePassword/ChangePassword";
import LoginActivity from "./LoginActivity/LoginActivity";
import TwoFactorAuth from "./TwoFactorsAuth/TwoFactorAuth";

export default function Security({ onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.security.navTitle")} onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={KeyRound}
          title={t("urmall.biz.security.changePwTitle")}
          description={t("urmall.biz.security.changePwDesc")}
          onClick={() => setCurrentView("password")}
        />
        <SettingsSubMenuItem
          icon={Activity}
          title={t("urmall.biz.security.loginTitle")}
          description={t("urmall.biz.security.loginDesc")}
          onClick={() => setCurrentView("login")}
        />
        <SettingsSubMenuItem
          icon={ShieldCheck}
          title={t("urmall.biz.security.twoFaTitle")}
          description={t("urmall.biz.security.twoFaDesc")}
          onClick={() => setCurrentView("2fa")}
        />
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "password") return <ChangePassword onBack={() => setCurrentView("menu")} />;
          if (view === "login") return <LoginActivity onBack={() => setCurrentView("menu")} />;
          if (view === "2fa") return <TwoFactorAuth onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
