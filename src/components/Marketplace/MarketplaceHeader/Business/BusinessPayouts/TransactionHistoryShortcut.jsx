import { useI18n, t } from "../../../../../i18n";
import TransactionRow from "./TransactionRow";

export default function TransactionHistoryShortcut({ onViewAll, transactions }) {
  useI18n();
  const canOpenHistory = typeof onViewAll === "function";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-black text-gray-950">{t("urmall.biz.pay.recentTx")}</h4>
        <button
          type="button"
          className="text-sm font-black text-blue-700 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
          disabled={!canOpenHistory}
          onClick={onViewAll}
        >
          {t("urmall.biz.pay.viewAll")}
        </button>
      </div>

      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </section>
  );
}
