// Favorite.jsx
// Shows user's favorite drivers or saved routes

import { FiHeart } from "react-icons/fi";

export default function Favorite({ onClick, count = 0, loading = false }) {
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
        <span className="block font-semibold text-gray-700">Saved Operators</span>
        <span className="mt-1 block text-xs font-semibold text-gray-400">
          {loading ? "Loading..." : `${count} saved`}
        </span>
      </span>
      <FiHeart size={24} className="text-gray-600" />
    </button>
    
  );
}
