// src/components/Marketplace/MarketplaceHeader/Business/BusinessIdentity/BusinessStatus.jsx

/**
 * BusinessStatus
 * --------------
 * Displays the current status of the business.
 * Easy to extend: open, closed, suspended, verified.
 */

export default function BusinessStatus({ status = "open" }) {
  const statusMap = {
    open: {
      label: "Open",
      color: "bg-green-100 text-green-700",
    },
    closed: {
      label: "Closed",
      color: "bg-red-100 text-red-700",
    },
    pending: {
      label: "Pending",
      color: "bg-yellow-100 text-yellow-700",
    },
  };

  const current = statusMap[status] || statusMap.open;

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${current.color}`}
    >
      {current.label}
    </span>
  );
}
