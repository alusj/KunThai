import { useState } from "react";

/* =========================
   Sub pages
========================= */
import StoreDetails from "./StoreDetails/StoreDetails";
import Categories from "./Categories/Categories";
import OperatingHours from "./OperatingHours/OperatingHours";

export default function ProfileSettings() {
  const [currentView, setCurrentView] = useState("menu");

  /* =========================
     FULL SCREEN VIEWS
  ========================= */

  if (currentView === "edit") {
    return (
      <StoreDetails
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "categories") {
    return (
      <Categories
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "hours") {
    return (
      <OperatingHours
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  /* =========================
     MENU (DEFAULT)
  ========================= */
  return (
    <div className="mx-4 bg-white rounded-xl border divide-y overflow-hidden">

      <MenuItem
        label="Operating Hours"
        onClick={() => setCurrentView("edit")}
      />

      <MenuItem
        label="Product Categories"
        onClick={() => setCurrentView("categories")}
      />

      <MenuItem
        label="Operating Hours"
        onClick={() => setCurrentView("hours")}
      />

    </div>
  );
}

/* =========================
   Menu Row
========================= */
function MenuItem({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 text-sm
                 hover:bg-gray-50 active:bg-gray-100"
    >
      {label}
    </button>
  );
}
