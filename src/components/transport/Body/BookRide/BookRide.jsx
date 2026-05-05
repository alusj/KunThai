// BookRide.jsx
// Enhanced Ride Selection Card

import FleetOptionButton from "../FleetOptionButton";
import { FaCarSide, FaMotorcycle } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";

export default function BookRide({ onSelectFleetType }) {
  return (
    <div
      className="
        relative
        bg-white
        rounded-3xl
        p-[2px]
        bg-gradient-to-br from-green-200 via-white to-green-100
        shadow-lg
      "
    >
      {/* Inner Card */}
      <div className="bg-white rounded-3xl p-3">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">
            Book a Ride
          </h3>

          {/* Subtle Ride Indicator 
          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
            Available
          </span>*/}
        </div>

        {/* Fleet Options */}
        <div className="grid grid-cols-3 gap-3">
          <FleetOptionButton
            icon={<FaMotorcycle />}
            label="Motorbike"
            onClick={() => onSelectFleetType("ride", "Motorcycle", "Motorbike")}
          />
          <FleetOptionButton
            icon={<MdElectricRickshaw />}
            label="Tricycle"
            onClick={() => onSelectFleetType("ride", "Tricycle", "Tricycle")}
          />
          <FleetOptionButton
            icon={<FaCarSide />}
            label="Taxi"
            onClick={() => onSelectFleetType("ride", "Car", "Taxi")}
          />
        </div>

      </div>
    </div>
  );
}
