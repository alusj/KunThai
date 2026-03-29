// Single insight row with status color

export default function InsightItem({ label, status }) {
  const colors = {
    positive: "text-green-600",
    warning: "text-yellow-600",
    danger: "text-red-600",
  };

  return (
    <div className="rounded-lg border bg-white p-3 flex items-center">
      <span className={`text-sm font-medium ${colors[status]}`}>
        {label}
      </span>
    </div>
  );
}
