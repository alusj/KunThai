// AreaView.jsx
// Allows user to navigate and explore nearby transport options

import { FiNavigation } from "react-icons/fi";

export default function AreaView({ onClick }) {
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
      <FiNavigation size={24} className="text-purple-600" />
      <span className="font-semibold text-gray-700">
        Nearby Area
      </span>
    </button>
  );
}
