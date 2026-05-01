const PRIORITY_STYLES = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

export default function AttentionPriorityBadge({ priority }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}
