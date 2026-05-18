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
        className="kt-touchable flex h-10 items-center justify-center gap-2 rounded-xl bg-green-600 px-3 text-white shadow-sm transition hover:bg-green-700"
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
      className="kt-touchable flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white transition hover:bg-green-700"
    >
      <FiPlus size={20} />
    </button>
  );
}
