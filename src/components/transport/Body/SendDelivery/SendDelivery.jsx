import { FaMotorcycle, FaTruck } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";

import FleetOptionButton from "../FleetOptionButton";

export default function SendDelivery({ onSelectFleetType }) {
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

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <FleetOptionButton icon={<FaMotorcycle />} label="Bike" onClick={() => onSelectFleetType("delivery", "Motorcycle", "Delivery Bike")} />
          <FleetOptionButton icon={<MdElectricRickshaw />} label="Tricycle" onClick={() => onSelectFleetType("delivery", "Tricycle", "Delivery Tricycle")} />
          <FleetOptionButton icon={<FaTruck />} label="Van" onClick={() => onSelectFleetType("delivery", "Car", "Van")} />
        </div>
      </div>
    </div>
  );
}
