import { useState } from "react";

/* =========================
   Sub pages
========================= */
import ChangePassword from "./ChangePassword/ChangePassword";
import LoginActivity from "./LoginActivity/LoginActivity";
import TwoFactorAuth from "./TwoFactorsAuth/TwoFactorAuth";

export default function Security() {
  const [currentView, setCurrentView] = useState("menu");

   /* =========================
     FULL SCREEN VIEWS
  ========================= */

  if (currentView === "edit") {
    return (
      <ChangePassword
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "login") {
    return (
      <LoginActivity
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "2fa") {
    return (
      <TwoFactorAuth
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
        label="Change Password"
        onClick={() => setCurrentView("edit")}
      />

      <MenuItem
        label="Login Activity"
        onClick={() => setCurrentView("login")}
      />

      <MenuItem
        label="Two Factors Auth"
        onClick={() => setCurrentView("2fa")}
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
