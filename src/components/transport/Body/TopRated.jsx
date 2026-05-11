// TopRated.jsx
// Shows top rated drivers or delivery operators

import { FiStar } from "react-icons/fi";

export default function TopRated({ onClick, count = 0, loading = false }) {
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
      <FiStar size={26} className="text-yellow-500" />
      <span>
        <span className="block font-bold text-gray-700">Top Rated</span>
        <span className="mt-1 block text-xs font-semibold text-gray-400">
          {loading ? "Loading..." : `${count} live fleets`}
        </span>
      </span>
    </button>
  );
}
