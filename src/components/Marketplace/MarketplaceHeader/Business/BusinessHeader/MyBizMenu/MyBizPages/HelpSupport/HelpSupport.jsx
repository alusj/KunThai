import { useState } from "react";

/* =========================
   Sub pages
========================= */
import ContactSupport from "./ContactSupport/ContactSupport";
import HelpHome from "./HelpHome/HelpHome";
import FAQ from "./FAQ/FAQ";

export default function HelpSupport() {
  const [currentView, setCurrentView] = useState("menu");

  /* =========================
     FULL SCREEN VIEWS
  ========================= */

  if (currentView === "edit") {
    return (
      <ContactSupport
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "help") {
    return (
      <HelpHome
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "faq") {
    return (
      <FAQ
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
        label="Contact Support"
        onClick={() => setCurrentView("edit")}
      />

      <MenuItem
        label="Help Home"
        onClick={() => setCurrentView("help")}
      />

      <MenuItem
        label="FAQs"
        onClick={() => setCurrentView("faq")}
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
