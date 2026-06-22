import { useEffect, useState } from "react";
import { useSellerAttention } from "../../../../../Backend/hooks/useSellerAttention";
import {
  applySeenNotificationState,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../../../../Backend/services/notificationSeenStore";
import AttentionEmptyState from "./AttentionEmptyState";
import AttentionItem from "./AttentionItem";

export default function BusinessAttention({ onAction }) {
  const { items, summary, loading } = useSellerAttention();
  const [, setSeenVersion] = useState(0);
  const readScope = "urmall:seller:notifications:read";
  const urgentItems = applySeenNotificationState(
    readScope,
    items.filter((item) => item.priority === "high").map((item) => ({ ...item, unread: true })),
  ).map((item) => ({ ...item, read: item.unread === false }));

  useEffect(() => subscribeNotificationSeen(() => setSeenVersion((version) => version + 1)), []);

  function handleAction(item) {
    markNotificationsSeen(readScope, [item]);
    setSeenVersion((version) => version + 1);
    onAction?.(item);
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-busy="true">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-20 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </section>
    );
  }

  if (urgentItems.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase text-red-600">Urgent Attention</p>
          <h3 className="mt-1 text-xl font-black text-gray-950">
            {urgentItems.length} urgent task{urgentItems.length === 1 ? "" : "s"} need review
          </h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Only time-sensitive seller work appears here. Everything else lives in its source section.
          </p>
        </div>

        <div className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
          <p className="text-xs font-black uppercase">Urgent</p>
          <p className="text-2xl font-black">{summary.high}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {urgentItems.map((item) => (
          <AttentionItem key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
    </section>
  );
}
