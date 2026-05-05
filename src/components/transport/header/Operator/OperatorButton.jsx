import { FiPlus } from "react-icons/fi";

export default function OperatorButton({ onClick }) {
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
