import { Clock3, Layers3, Store } from "lucide-react";
import { useState } from "react";

import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import Categories from "./Categories/Categories";
import OperatingHours from "./OperatingHours/OperatingHours";
import StoreDetails from "./StoreDetails/StoreDetails";

export default function BusinessSettings({ onBack }) {
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Store Settings" onBack={onBack} />
      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <SettingsSubMenuItem
          icon={Store}
          title="Store Details"
          description="Edit address, contacts, delivery, pickup, and public store info."
          onClick={() => setCurrentView("details")}
        />
        <SettingsSubMenuItem
          icon={Layers3}
          title="Product Categories"
          description="Manage the categories that define what your business sells."
          onClick={() => setCurrentView("categories")}
        />
        <SettingsSubMenuItem
          icon={Clock3}
          title="Operating Hours"
          description="Set business opening days and customer service hours."
          onClick={() => setCurrentView("hours")}
        />
      </div>

      {currentView === "details" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <StoreDetails onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "categories" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <Categories onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "hours" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <OperatingHours onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}
    </div>
  );
}
