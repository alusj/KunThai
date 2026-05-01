const STATUS_LABELS = {
  active: "Active",
  draft: "Draft",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
  "pending-review": "Pending review",
  paused: "Paused",
};

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700",
  draft: "bg-gray-100 text-gray-600",
  "low-stock": "bg-amber-50 text-amber-700",
  "out-of-stock": "bg-red-50 text-red-700",
  "pending-review": "bg-blue-50 text-blue-700",
  paused: "bg-gray-100 text-gray-600",
};

export default function ProductStatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
