// MenuButton.jsx
// Opens navigation drawer or transport settings menu

import { FiMenu } from "react-icons/fi";

export default function MenuButton() {
  const handleClick = () => {
    console.log("Open Menu");
  };

  return (
    <button
      onClick={handleClick}
      className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
    >
      <FiMenu size={22} />
    </button>
  );
}