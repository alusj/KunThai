import { useSellerActivities } from "../../../../../Backend/hooks/useSellerActivities";
import ActivityItem from "./ActivityItem";
import ActivitySummary from "./ActivitySummary";

export default function BusinessActivity() {
  const { activities, summary, loading } = useSellerActivities();

  if (loading) {
    return <div className="h-80 rounded-xl bg-white shadow-sm" />;
  }

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
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    </section>
  );
}
