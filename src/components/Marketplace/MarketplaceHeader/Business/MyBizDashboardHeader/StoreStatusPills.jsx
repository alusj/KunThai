import { Bike, Clock, Store } from "lucide-react";

import { useI18n, t } from "../../../../../i18n";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

function StatusPill({ icon: Icon, label, active }) {
  useUiLocale();
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
        active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2.3} />
      {translateUi(label)}
    </span>
  );
}

export default function StoreStatusPills({ status }) {
  useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      {/* No badge when the business has no operating hours saved. */}
      {typeof status.open === "boolean" ? (
        <StatusPill
          icon={Clock}
          label={status.open ? t("urmall.biz.dash.openNow") : t("urmall.biz.dash.closed")}
          active={status.open}
        />
      ) : null}
      <StatusPill
        icon={Bike}
        label={t("urmall.browse.deliveryChip")}
        active={status.deliveryEnabled}
      />
      <StatusPill
        icon={Store}
        label={t("urmall.browse.pickupChip")}
        active={status.pickupEnabled}
      />
    </div>
  );
}
