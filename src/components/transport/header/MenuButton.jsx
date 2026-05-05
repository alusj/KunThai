import { FiMenu } from "react-icons/fi";

export default function MenuButton({ onClick }) {
  return (
    <button
      type="button"
      aria-label="Open transport menu"
      onClick={onClick}
      className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
    >
      <FiMenu size={22} />
    </button>
  );
}
