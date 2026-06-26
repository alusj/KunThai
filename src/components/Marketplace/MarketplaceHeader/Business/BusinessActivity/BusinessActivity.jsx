import { useEffect, useRef, useState } from "react";

import { useSellerActivities } from "../../../../../Backend/hooks/useSellerActivities";
import ActivityItem from "./ActivityItem";
import ActivitySummary from "./ActivitySummary";

const ACTIVITY_WIPE_MS = 320;

export default function BusinessActivity({ onViewProduct }) {
  const { activities, dismissActivity, summary, loading } = useSellerActivities();
  const [dismissingIds, setDismissingIds] = useState(() => new Set());
  const [actionBusyId, setActionBusyId] = useState("");
  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = [];
    };
  }, []);

  function handleDone(activity) {
    if (!activity?.id || dismissingIds.has(activity.id)) return;

    setDismissingIds((current) => new Set(current).add(activity.id));
    const timerId = window.setTimeout(() => {
      dismissActivity(activity.id);
      setDismissingIds((current) => {
        const next = new Set(current);
        next.delete(activity.id);
        return next;
      });
    }, ACTIVITY_WIPE_MS);
    timersRef.current.push(timerId);
  }

  async function handleAction(activity) {
    if (!activity?.actionLabel || actionBusyId) return;

    try {
      setActionBusyId(activity.id);
      await onViewProduct?.(activity);
    } finally {
      setActionBusyId("");
    }
  }

  if (loading) return null;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-black uppercase text-gray-700">Recent Activity</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">Store timeline</h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Orders, messages, payments, stock changes, reviews, and campaign updates.
        </p>
      </div>

      <ActivitySummary summary={summary} />

      <div>
        {activities.map((activity) => (
          <ActivityItem
            key={activity.id}
            actionBusy={actionBusyId === activity.id}
            activity={activity}
            dismissing={dismissingIds.has(activity.id)}
            onAction={handleAction}
            onDone={handleDone}
          />
        ))}
      </div>
    </section>
  );
}
