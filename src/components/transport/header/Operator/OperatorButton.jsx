import { FiPlus } from "react-icons/fi";
import { FiTruck } from "react-icons/fi";

export default function OperatorButton({ hasOperatorAccount, onClick }) {
  if (hasOperatorAccount) {
    return (
      <button
        type="button"
        aria-label="Open my fleet"
        title="My Fleet"
        onClick={onClick}
        className="h-10 rounded-full bg-green-600 px-3 text-white hover:bg-green-700 transition flex items-center justify-center gap-2 shadow-sm"
      >
        <FiTruck size={18} />
        <span className="text-sm font-bold whitespace-nowrap">My Fleet</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Register fleet"
      title="Register fleet"
      onClick={onClick}
      className="w-10 h-10 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 transition"
    >
      <FiPlus size={20} />
    </button>
  );
}
