import { Bike, Clock, Store } from "lucide-react";

function StatusPill({ icon: Icon, label, active }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
        active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2.3} />
      {label}
    </span>
  );
}

export default function StoreStatusPills({ status }) {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusPill
        icon={Clock}
        label={status.open ? "Open now" : "Closed"}
        active={status.open}
      />
      <StatusPill
        icon={Bike}
        label="Delivery"
        active={status.deliveryEnabled}
      />
      <StatusPill
        icon={Store}
        label="Pickup"
        active={status.pickupEnabled}
      />
    </div>
  );
}
