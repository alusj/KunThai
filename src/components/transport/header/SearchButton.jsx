// Opens transport identity search for operators, codes, plates, and fleet types.

import { FiSearch } from "react-icons/fi";

export default function SearchButton() {
  const handleClick = () => {
    console.log("Open Search");
  };

  return (
    <button
      type="button"
      aria-label="Search operator, code, plate, or fleet"
      title="Search operator, code, plate, or fleet"
      onClick={handleClick}
      className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition"
    >
      <FiSearch size={20} />
    </button>
  );
}
