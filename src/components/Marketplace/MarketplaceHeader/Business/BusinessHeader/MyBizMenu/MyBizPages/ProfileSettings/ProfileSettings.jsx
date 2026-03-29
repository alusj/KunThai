import { useState } from "react";

/* =========================
   Sub pages
========================= */
import EditProfile from "./EditProfile/EditProfile";
import BusinessInfo from "./BusinessInfo/BusinessInfo";
import ChangePassword from "./ChangePassword/ChangePassword";

export default function ProfileSettings() {
  const [currentView, setCurrentView] = useState("menu");

  /* =========================
     FULL SCREEN VIEWS
  ========================= */

  if (currentView === "edit") {
    return (
      <EditProfile
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "business") {
    return (
      <BusinessInfo
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "password") {
    return (
      <ChangePassword
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
        label="Edit Profile"
        onClick={() => setCurrentView("edit")}
      />

      <MenuItem
        label="Business Information"
        onClick={() => setCurrentView("business")}
      />

      <MenuItem
        label="Change Password"
        onClick={() => setCurrentView("password")}
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
