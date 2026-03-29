// TopRated.jsx
// Shows top rated drivers or delivery operators

import { FiStar } from "react-icons/fi";

export default function TopRated() {
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
      <FiStar size={26} className="text-yellow-500" />
      <span className="font-bold text-gray-700">
        Top Rated
      </span>
    </button>
  );
}