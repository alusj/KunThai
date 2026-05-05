// Favorite.jsx
// Shows user's favorite drivers or saved routes

import { FiHeart } from "react-icons/fi";

export default function Favorite() {
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
        Saved Operators
      </span>
      <FiHeart size={24} className="text-gray-600" />
    </button>
    
  );
}
