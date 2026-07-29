import { useSellerPayouts } from "../../../../../Backend/hooks/useSellerPayouts";
import { useI18n, t } from "../../../../../i18n";
import PayoutBalanceCard from "./PayoutBalanceCard";
import PayoutSchedule from "./PayoutSchedule";
import PayoutWarning from "./PayoutWarning";
import TransactionHistoryShortcut from "./TransactionHistoryShortcut";
import WithdrawalMethod from "./WithdrawalMethod";

export default function BusinessPayouts() {
  useI18n();
  const {
    availableBalance,
    pendingBalance,
    lastPayout,
    nextPayout,
    withdrawalMethod,
    warning,
    recentTransactions,
    loading,
  } = useSellerPayouts();

  if (loading) return null;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-emerald-700">{t("urmall.biz.pay.kicker")}</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">{t("urmall.biz.pay.title")}</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {t("urmall.biz.pay.subtitle")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <PayoutBalanceCard label={t("urmall.biz.intel.availableBalance")} amount={availableBalance} tone="green" />
        <PayoutBalanceCard label={t("urmall.biz.intel.pendingBalance")} amount={pendingBalance} tone="amber" />
      </div>

      <PayoutWarning warning={warning} />
      {lastPayout && nextPayout ? (
        <PayoutSchedule lastPayout={lastPayout} nextPayout={nextPayout} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-black text-gray-950">{t("urmall.biz.pay.noSchedule")}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            {t("urmall.biz.pay.noScheduleDesc")}
          </p>
        </div>
      )}
      {withdrawalMethod ? (
        <WithdrawalMethod method={withdrawalMethod} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-black text-gray-950">{t("urmall.biz.pay.noMethod")}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            {t("urmall.biz.pay.noMethodDesc")}
          </p>
        </div>
      )}
      {recentTransactions.length > 0 ? (
        <TransactionHistoryShortcut transactions={recentTransactions} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-black text-gray-950">{t("urmall.biz.pay.noTx")}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            {t("urmall.biz.pay.noTxDesc")}
          </p>
        </div>
      )}
    </section>
  );
}
