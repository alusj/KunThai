import { Landmark, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";

import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import BankDetails from "./BankDetails/BankDetails";
import Transactions from "./Transaction/Transactions";
import WithdrawalHistory from "./WithdrawalHistory/WithdrawalHistory";

export default function Payments({ onBack }) {
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title="Payments & Payouts" onBack={onBack} />
      <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-sm font-black text-amber-950">Payment service currently not available</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-amber-900/80">
                We are building a payment service that will work directly with your UrMall items, orders, and seller records. Until it is ready, communicate payment terms clearly with buyers and keep order details inside the platform wherever possible.
              </p>
            </div>
          </div>
        </section>

        <SettingsSubMenuItem
          icon={Landmark}
          title="Bank Details"
          description="Currently unavailable while UrMall payment setup is being prepared."
          onClick={() => setCurrentView("bank")}
        />
        <SettingsSubMenuItem
          icon={ReceiptText}
          title="Transactions"
          description="Transaction records will appear after built-in payments are launched."
          onClick={() => setCurrentView("transactions")}
        />
        <SettingsSubMenuItem
          icon={WalletCards}
          title="Withdrawal History"
          description="Payout history will become active when seller payouts are enabled."
          onClick={() => setCurrentView("history")}
        />
      </div>

      {currentView === "bank" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <BankDetails onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "transactions" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <Transactions onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}

      {currentView === "history" ? (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
          <WithdrawalHistory onBack={() => setCurrentView("menu")} />
        </div>
      ) : null}
    </div>
  );
}
