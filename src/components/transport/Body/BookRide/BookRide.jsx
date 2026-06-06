import { FaCarSide, FaMotorcycle } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";

import FleetOptionButton from "../FleetOptionButton";

export default function BookRide({ onSelectFleetType }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-white p-3 shadow-lg shadow-emerald-100/70">
      <div className="absolute right-0 top-0 h-20 w-20 rounded-bl-[4rem] bg-emerald-50" />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Book a Ride</h3>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
            Passenger
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <FleetOptionButton icon={<FaMotorcycle />} label="Bike" onClick={() => onSelectFleetType("ride", "Motorcycle", "Bike")} />
          <FleetOptionButton icon={<MdElectricRickshaw />} label="Tricycle" onClick={() => onSelectFleetType("ride", "Tricycle", "Tricycle")} />
          <FleetOptionButton icon={<FaCarSide />} label="Taxi" onClick={() => onSelectFleetType("ride", "Car", "Taxi")} />
        </div>
      </div>
    </div>
  );
}
