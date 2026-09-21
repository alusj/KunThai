import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function TransactionRow({ transaction }) {
  useUiLocale();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-gray-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-gray-950">{translateUi(transaction.label)}</p>
        <p className="text-xs font-bold text-gray-500">
          {transaction.date} · {translateUi(transaction.status)}
        </p>
      </div>
      <p className={`text-sm font-black ${transaction.amount < 0 ? "text-red-700" : "text-gray-950"}`}>
        {formatCurrency(transaction.amount)}
      </p>
    </div>
  );
}
