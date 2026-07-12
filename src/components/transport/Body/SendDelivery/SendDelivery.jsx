import { FaMotorcycle, FaTruck } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";

import FleetOptionButton from "../FleetOptionButton";
import { getDeliveryFleetOptions } from "../../../../data/globalTransportCapabilities";

export default function SendDelivery({ onSelectFleetType }) {
  const options = getDeliveryFleetOptions();
  const icons = {
    Car: <FaTruck />,
    Motorcycle: <FaMotorcycle />,
    Tricycle: <MdElectricRickshaw />,
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-white p-3 shadow-lg shadow-amber-100/70">
      <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-[4rem] bg-amber-50" />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Send Delivery</h3>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
            Parcel
          </span>
        </div>

        <div className={`grid gap-2 sm:gap-3 ${options.length === 1 ? "grid-cols-1" : options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {options.map((option) => (
            <FleetOptionButton
              key={option.value}
              icon={icons[option.value] || <FaTruck />}
              label={option.label}
              onClick={() => onSelectFleetType("delivery", option.value, option.displayName || option.label)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
