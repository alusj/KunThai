// ActivityItem.jsx
// ----------------
// Single activity row.
// Small, reusable, and focused on UI only.

export default function ActivityItem({ icon, message, time }) {
  return (
    <div className="flex items-start gap-3">

      {/* =========================
          Activity icon
      ========================= */}
      <div className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-100 text-sm">
        {icon}
      </div>

      {/* =========================
          Activity content
      ========================= */}
      <div className="flex-1">
        <p className="text-sm text-gray-800">
          {message}
        </p>
        <span className="text-xs text-gray-500">
          {time}
        </span>
      </div>

    </div>
  );
}
