import { useState } from "react";

/* =========================
   Sub pages
========================= */
import BankDetails from "./BankDetails/BankDetails";
import Transactions from "./Transaction/Transactions";
import WithdrawalHistory from "./WithdrawalHistory/WithdrawalHistory";

export default function Payments() {
  const [currentView, setCurrentView] = useState("home");

   /* =========================
     FULL SCREEN VIEWS
  ========================= */

  if (currentView === "edit") {
    return (
      <BankDetails
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "transactions") {
    return (
      <Transactions
        onBack={() => setCurrentView("menu")}
      />
    );
  }

  if (currentView === "history") {
    return (
      <WithdrawalHistory
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
        label="Bank Details"
        onClick={() => setCurrentView("edit")}
      />

      <MenuItem
        label="Transactions"
        onClick={() => setCurrentView("transactions")}
      />

      <MenuItem
        label="Withdrawal History"
        onClick={() => setCurrentView("history")}
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
