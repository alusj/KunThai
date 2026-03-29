// BusinessActivity.jsx
// --------------------
// Container for recent business activities.
// Responsible ONLY for layout and data mapping.

import ActivityItem from "./ActivityItem";

export default function BusinessActivity() {
  // =========================
  // TEMP mock activity data
  // (Later this will come from Supabase)
  // =========================
  const activities = [
    {
      id: 1,
      type: "order",
      message: "New order received",
      time: "2 mins ago",
      icon: "🧾",
    },
    {
      id: 2,
      type: "message",
      message: "New message from a buyer",
      time: "10 mins ago",
      icon: "💬",
    },
    {
      id: 3,
      type: "product",
      message: "Product stock updated",
      time: "1 hour ago",
      icon: "📦",
    },
  ];

  return (
    <section className="bg-white rounded-xl p-4 shadow-sm space-y-4">

      {/* =========================
          Section title
      ========================= */}
      <h3 className="text-sm font-semibold text-gray-800">
        Recent Activity
      </h3>

      {/* =========================
          Activity list
      ========================= */}
      <div className="space-y-3">
        {activities.map(activity => (
          <ActivityItem
            key={activity.id}
            icon={activity.icon}
            message={activity.message}
            time={activity.time}
          />
        ))}
      </div>

    </section>
  );
}
