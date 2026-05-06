// Displays current ride and delivery activity for this transport area.

import { FiClock } from "react-icons/fi";

export default function TourHistory({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
bg-white 
rounded-3xl 
shadow-md 
hover:shadow-lg 
transition 
p-6 
h-32 
flex 
flex-col 
justify-between
"
    >
    
      <span className="font-semibold text-gray-700">
        Active Trips
      </span>
        <FiClock size={24} className="text-gray-600" />
    </button>
  );
}
