import { FiMenu } from "react-icons/fi";

export default function MenuButton({ onClick }) {
  return (
    <button
      type="button"
      aria-label="Open transport menu"
      onClick={onClick}
      className="kt-touchable flex h-9 w-9 items-center justify-center rounded-xl hover:bg-gray-100 transition"
    >
      <FiMenu size={22} />
    </button>
  );
}
