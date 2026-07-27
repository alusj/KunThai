import { Building2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n, t } from "../../../../../../../../i18n";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import BusinessInfo from "./BusinessInfo/BusinessInfo";
import EditProfile from "./EditProfile/EditProfile";

export default function ProfileSettings({ initialView = "menu", onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState(initialView);

  useEffect(() => {
    setCurrentView(initialView);
  }, [initialView]);

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.menu.profileTitle")} onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={UserRound}
          title={t("urmall.biz.profile.editTitle")}
          description={t("urmall.biz.profile.editDesc")}
          onClick={() => setCurrentView("edit")}
        />
        <SettingsSubMenuItem
          icon={Building2}
          title={t("urmall.biz.profile.bizInfoTitle")}
          description={t("urmall.biz.profile.bizInfoDesc")}
          onClick={() => setCurrentView("business")}
        />
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "edit") return <EditProfile onBack={() => setCurrentView("menu")} />;
          if (view === "business") return <BusinessInfo onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
