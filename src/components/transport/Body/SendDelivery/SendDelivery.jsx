// SendDelivery.jsx

import FleetOptionButton from "../FleetOptionButton";
import { FaMotorcycle } from "react-icons/fa";
import { FaTruck } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";
//import PublicTransport from "./PublicTransport";

export default function SendDelivery({ onSelectFleetType }) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-1">
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        Send Delivery
      </h3>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <FleetOptionButton
          icon={<FaMotorcycle />}
          label="Bike"
          onClick={() => onSelectFleetType("delivery", "Motorcycle", "Delivery Bike")}
        />
        <FleetOptionButton
          icon={<MdElectricRickshaw />}
          label="Tricycle"
          onClick={() => onSelectFleetType("delivery", "Tricycle", "Delivery Tricycle")}
        />
        <FleetOptionButton
          icon={<FaTruck />}
          label="Van"
          onClick={() => onSelectFleetType("delivery", "Car", "Van")}
        />
       {/* <PublicTransport />*/}
      </div>
    </div>
  );
}
