import { FaCarSide, FaMotorcycle, FaShuttleVan, FaTruck } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";

// The fleet-type icon UrRide already uses on its Book a Ride / Send Delivery
// buttons (BookRide.jsx, SendDelivery.jsx), shown next to a fleet's name on
// its cards so the type reads at a glance. Delivery cars use the delivery
// menu's truck, like the Send Delivery buttons.
const ICONS = {
  motorcycle: FaMotorcycle,
  motorbike: FaMotorcycle,
  bike: FaMotorcycle,
  okada: FaMotorcycle,
  tricycle: MdElectricRickshaw,
  keke: MdElectricRickshaw,
  van: FaShuttleVan,
  bus: FaShuttleVan,
  minibus: FaShuttleVan,
  truck: FaTruck,
};

function fleetTypeIconFor(fleet) {
  const type = String(fleet?.fleetType || fleet?.fleet_type || "").toLowerCase();
  if (ICONS[type]) return ICONS[type];
  const delivery = String(fleet?.serviceCategory || fleet?.service_category || "").toLowerCase() === "delivery";
  return delivery ? FaTruck : FaCarSide;
}

export default function FleetTypeIcon({ fleet, size = 15, className = "" }) {
  const Icon = fleetTypeIconFor(fleet);
  return (
    <span
      aria-hidden="true"
      data-fleet-type-icon={String(fleet?.fleetType || "").toLowerCase() || undefined}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700 ${className}`}
    >
      <Icon size={size} />
    </span>
  );
}
