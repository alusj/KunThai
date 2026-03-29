// TourHistory.jsx
// Displays user's ride and delivery history

import { FiClock } from "react-icons/fi";

export default function TourHistory() {
  return (
    <button className="
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
">
    
      <span className="font-semibold text-gray-700">
        Tour History
      </span>
        <FiClock size={24} className="text-gray-600" />
    </button>
  );
}