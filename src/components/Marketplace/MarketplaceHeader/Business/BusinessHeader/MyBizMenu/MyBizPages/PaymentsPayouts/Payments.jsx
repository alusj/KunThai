import { Landmark, ReceiptText, WalletCards } from "lucide-react";
import { useState } from "react";

import SettingsSubMenuItem from "../SettingsSubMenuItem";
import BankDetails from "./BankDetails/BankDetails";
import Transactions from "./Transaction/Transactions";
import WithdrawalHistory from "./WithdrawalHistory/WithdrawalHistory";

export default function Payments() {
  const [currentView, setCurrentView] = useState("menu");

  if (currentView === "bank") {
    return <BankDetails onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "transactions") {
    return <Transactions onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "history") {
    return <WithdrawalHistory onBack={() => setCurrentView("menu")} />;
  }

  return (
    <div className="space-y-3 px-4">
      <SettingsSubMenuItem
        icon={Landmark}
        title="Bank Details"
        description="Add or update the withdrawal account for payouts."
        onClick={() => setCurrentView("bank")}
      />
      <SettingsSubMenuItem
        icon={ReceiptText}
        title="Transactions"
        description="Review sales, charges, refunds, and payout movement."
        onClick={() => setCurrentView("transactions")}
      />
      <SettingsSubMenuItem
        icon={WalletCards}
        title="Withdrawal History"
        description="See previous withdrawals and failed payout attempts."
        onClick={() => setCurrentView("history")}
      />
    </div>
  );
}
