const STATUS_LABELS = {
  active: "Active",
  completed: "Done",
  "needs-reply": "Reply",
  new: "New",
  warning: "Warning",
};

const STATUS_STYLES = {
  active: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  "needs-reply": "bg-red-50 text-red-700",
  new: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
};

export default function ActivityStatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
