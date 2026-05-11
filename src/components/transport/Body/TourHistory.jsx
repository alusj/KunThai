// Displays current ride and delivery activity for this transport area.

import { FiClock } from "react-icons/fi";

export default function TourHistory({ onClick, count = 0, loading = false }) {
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
    
      <span>
        <span className="block font-semibold text-gray-700">Active Trips</span>
        <span className="mt-1 block text-xs font-semibold text-gray-400">
          {loading ? "Loading..." : `${count} live`}
        </span>
      </span>
      <FiClock size={24} className="text-gray-600" />
    </button>
  );
}
