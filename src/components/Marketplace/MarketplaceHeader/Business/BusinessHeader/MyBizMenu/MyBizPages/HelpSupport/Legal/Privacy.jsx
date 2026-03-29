import { useState } from "react";

/* =========================
   Sub pages (same folder)
========================= */
import PrivacyPolicy from "./PrivacyPolicy/PrivacyPolicy";
import DataUsage from "./DataUsage/DataUsage";
import CommunityGuidelines from "./CommunityGuidelines/CommunityGuidelines";
import TermsOfService from "./TermsOfServices/TermsOfService";

export default function Privacy() {
  const [currentView, setCurrentView] = useState("menu");

  /* =========================
     FULL SCREEN VIEWS
  ========================= */

  if (currentView === "privacy") {
    return (
      <PrivacyPolicy
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "data") {
    return (
      <DataUsage
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  
  if (currentView === "guidelines") {
    return (
      <CommunityGuidelines
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "service") {
    return (
      <TermsOfService
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
        label="Privacy Policy"
        onClick={() => setCurrentView("privacy")}
      />

      <MenuItem
        label="Data Usage"
        onClick={() => setCurrentView("data")}
      />

      <MenuItem
        label="Community Guidelines"
        onClick={() => setCurrentView("guidelines")}
      />

       <MenuItem
        label="Terms Of Service"
        onClick={() => setCurrentView("service")}
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
