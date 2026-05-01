import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";

export default function TransactionRow({ transaction }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-gray-950">{transaction.label}</p>
        <p className="text-xs font-bold text-gray-500">
          {transaction.date} · {transaction.status}
        </p>
      </div>
      <p className={`text-sm font-black ${transaction.amount < 0 ? "text-red-700" : "text-gray-950"}`}>
        {formatCurrency(transaction.amount)}
      </p>
    </div>
  );
}
