import { Clock3, Layers3, Store } from "lucide-react";
import { useState } from "react";

import SettingsSubMenuItem from "../SettingsSubMenuItem";
import Categories from "./Categories/Categories";
import OperatingHours from "./OperatingHours/OperatingHours";
import StoreDetails from "./StoreDetails/StoreDetails";

export default function BusinessSettings() {
  const [currentView, setCurrentView] = useState("menu");

  if (currentView === "details") {
    return <StoreDetails onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "categories") {
    return <Categories onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "hours") {
    return <OperatingHours onBack={() => setCurrentView("menu")} />;
  }

  return (
    <div className="space-y-3 px-4">
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
  );
}
