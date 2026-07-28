import { CalendarClock } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";

export default function BestSalesWindowCard({ window }) {
  useI18n();
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <CalendarClock size={21} strokeWidth={2.3} />
        </span>
        <div>
          <p className="text-sm font-bold text-gray-500">{t("urmall.biz.stats.bestWindow")}</p>
          <p className="mt-1 text-xl font-black text-gray-950">
            {window.day}, {window.time}
          </p>
          <p className="mt-2 text-sm font-medium text-gray-500">
            {t("urmall.biz.stats.bestWindowOrders", { count: window.orderCount })}
          </p>
        </div>
      </div>
    </article>
  );
}
