import { useSellerPayouts } from "../../../../../Backend/hooks/useSellerPayouts";
import PayoutBalanceCard from "./PayoutBalanceCard";
import PayoutSchedule from "./PayoutSchedule";
import PayoutWarning from "./PayoutWarning";
import TransactionHistoryShortcut from "./TransactionHistoryShortcut";
import WithdrawalMethod from "./WithdrawalMethod";

export default function BusinessPayouts() {
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
        <p className="text-sm font-black uppercase text-emerald-700">Payouts</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">Money clarity</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          See what is available, pending, and scheduled for withdrawal.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <PayoutBalanceCard label="Available balance" amount={availableBalance} tone="green" />
        <PayoutBalanceCard label="Pending balance" amount={pendingBalance} tone="amber" />
      </div>

      <PayoutWarning warning={warning} />
      {lastPayout && nextPayout ? (
        <PayoutSchedule lastPayout={lastPayout} nextPayout={nextPayout} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-black text-gray-950">No payout schedule yet</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Your payout dates will appear after your first eligible sale.
          </p>
        </div>
      )}
      {withdrawalMethod ? (
        <WithdrawalMethod method={withdrawalMethod} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-black text-gray-950">No withdrawal method added</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Add KunThai Money or a bank account later from payout settings.
          </p>
        </div>
      )}
      {recentTransactions.length > 0 ? (
        <TransactionHistoryShortcut transactions={recentTransactions} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-black text-gray-950">No transactions yet</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Transaction history will appear after orders, fees, and payouts begin.
          </p>
        </div>
      )}
    </section>
  );
}
