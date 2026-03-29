// SearchButton.jsx
// Opens transport search modal (ride, driver, delivery etc.)

import { FiSearch } from "react-icons/fi";

export default function SearchButton() {
  const handleClick = () => {
    console.log("Open Search");
  };

  return (
    <button
      onClick={handleClick}
      className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
    >
      <FiSearch size={20} />
    </button>
  );
}