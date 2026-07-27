import { Clock3, Layers3, Store } from "lucide-react";
import { useState } from "react";

import { useI18n, t } from "../../../../../../../../i18n";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import Categories from "./Categories/Categories";
import OperatingHours from "./OperatingHours/OperatingHours";
import StoreDetails from "./StoreDetails/StoreDetails";

export default function BusinessSettings({ onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.menu.storeSettingsTitle")} onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={Store}
          title={t("urmall.biz.settings.storeDetailsTitle")}
          description={t("urmall.biz.settings.storeDetailsDesc")}
          onClick={() => setCurrentView("details")}
        />
        <SettingsSubMenuItem
          icon={Layers3}
          title={t("urmall.biz.settings.categoriesTitle")}
          description={t("urmall.biz.settings.categoriesDesc")}
          onClick={() => setCurrentView("categories")}
        />
        <SettingsSubMenuItem
          icon={Clock3}
          title={t("urmall.biz.settings.hoursTitle")}
          description={t("urmall.biz.settings.hoursDesc")}
          onClick={() => setCurrentView("hours")}
        />
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "details") return <StoreDetails onBack={() => setCurrentView("menu")} />;
          if (view === "categories") return <Categories onBack={() => setCurrentView("menu")} />;
          if (view === "hours") return <OperatingHours onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
