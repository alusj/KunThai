import TransactionRow from "./TransactionRow";

export default function TransactionHistoryShortcut({ onViewAll, transactions }) {
  const canOpenHistory = typeof onViewAll === "function";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-black text-gray-950">Recent transactions</h4>
        <button
          type="button"
          className="text-sm font-black text-blue-700 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
          disabled={!canOpenHistory}
          onClick={onViewAll}
        >
          View all
        </button>
      </div>

      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </section>
  );
}
