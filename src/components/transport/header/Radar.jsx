// header/Radar.jsx
// Smart Match Radar Button (Header Version)

import { Target } from "lucide-react";

export default function Radar({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="
        relative
        w-10
        h-10
        rounded-full
        bg-green-600
        text-white
        flex
        items-center
        justify-center
        shadow-md
        hover:scale-105
        active:scale-95
        transition
      "
    >
      <Target size={18} />
    </button>
  );
}