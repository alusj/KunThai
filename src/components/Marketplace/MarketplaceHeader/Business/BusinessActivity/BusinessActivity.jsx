import { useState } from "react";

import { useSellerActivities } from "../../../../../Backend/hooks/useSellerActivities";
import { useI18n, t } from "../../../../../i18n";
import { showToast } from "../../../../../Backend/services/toastService";
import { shortErrorToast } from "../../../../../Backend/services/friendlyErrorService";
import ActivityItem from "./ActivityItem";
import ActivitySummary from "./ActivitySummary";

export default function BusinessActivity({ onViewProduct }) {
  useI18n();
  const { activities, summary, loading } = useSellerActivities();
  const [actionBusyId, setActionBusyId] = useState("");

  async function handleAction(activity) {
    if (!activity?.actionLabel || actionBusyId) return;

    try {
      setActionBusyId(activity.id);
      await onViewProduct?.(activity);
    } catch (error) {
      showToast(shortErrorToast(error, t("sellerFix.productOpenFailed")), "danger");
    } finally {
      setActionBusyId("");
    }
  }

  if (loading) return null;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-gray-700">{t("urmall.biz.actv.kicker")}</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">{t("urmall.biz.actv.title")}</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {t("urmall.biz.actv.subtitle")}
        </p>
      </div>

      <ActivitySummary summary={summary} />

      <div>
        {activities.map((activity) => (
          <ActivityItem
            key={activity.id}
            actionBusy={actionBusyId === activity.id}
            activity={activity}
            onAction={handleAction}
          />
        ))}
      </div>
    </section>
  );
}
