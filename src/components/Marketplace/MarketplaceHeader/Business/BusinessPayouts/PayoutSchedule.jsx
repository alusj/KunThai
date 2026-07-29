import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";

export default function PayoutSchedule({ lastPayout, nextPayout }) {
  useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      <ScheduleItem
        label={t("urmall.biz.pay.lastPayout")}
        amount={lastPayout.amount}
        date={lastPayout.date}
        status={lastPayout.status}
      />
      <ScheduleItem
        label={t("urmall.biz.pay.nextPayout")}
        amount={nextPayout.amount}
        date={nextPayout.date}
        status={t("urmall.biz.pay.scheduled")}
      />
    </div>
  );
}

function ScheduleItem({ label, amount, date, status }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-500">{label}</p>
          <p className="mt-1 text-lg font-black text-gray-950">{formatCurrency(amount)}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">{date}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-700">
          {status}
        </span>
      </div>
    </div>
  );
}
