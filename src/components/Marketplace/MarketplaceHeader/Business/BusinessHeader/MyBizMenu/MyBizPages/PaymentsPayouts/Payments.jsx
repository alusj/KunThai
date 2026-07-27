import { Landmark, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";

import { useI18n, t } from "../../../../../../../../i18n";
import SellerMenuPageHeader from "../SellerMenuPageHeader";
import SellerSubPagePanel from "../SellerSubPagePanel";
import SettingsSubMenuItem from "../SettingsSubMenuItem";
import BankDetails from "./BankDetails/BankDetails";
import Transactions from "./Transaction/Transactions";
import WithdrawalHistory from "./WithdrawalHistory/WithdrawalHistory";

export default function Payments({ onBack }) {
  useI18n();
  const [currentView, setCurrentView] = useState("menu");

  return (
    <div className="relative min-h-full bg-white">
      <SellerMenuPageHeader title={t("urmall.biz.menu.paymentsTitle")} onBack={onBack} />
      <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-sm font-black text-amber-950">{t("urmall.biz.payments.bannerTitle")}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-amber-900/80">
                {t("urmall.biz.payments.bannerBody")}
              </p>
            </div>
          </div>
        </section>

        <SettingsSubMenuItem
          icon={Landmark}
          title={t("urmall.biz.payments.bankTitle")}
          description={t("urmall.biz.payments.bankDesc")}
          onClick={() => setCurrentView("bank")}
        />
        <SettingsSubMenuItem
          icon={ReceiptText}
          title={t("urmall.biz.payments.txTitle")}
          description={t("urmall.biz.payments.txDesc")}
          onClick={() => setCurrentView("transactions")}
        />
        <SettingsSubMenuItem
          icon={WalletCards}
          title={t("urmall.biz.payments.historyTitle")}
          description={t("urmall.biz.payments.historyDesc")}
          onClick={() => setCurrentView("history")}
        />
      </div>

      <SellerSubPagePanel currentView={currentView}>
        {(view) => {
          if (view === "bank") return <BankDetails onBack={() => setCurrentView("menu")} />;
          if (view === "transactions") return <Transactions onBack={() => setCurrentView("menu")} />;
          if (view === "history") return <WithdrawalHistory onBack={() => setCurrentView("menu")} />;
          return null;
        }}
      </SellerSubPagePanel>
    </div>
  );
}
