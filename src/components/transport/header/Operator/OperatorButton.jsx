// OperatorButton.jsx
// Represents the "Register as Operator" action
// Appears on the left side of the header

import { FiPlus } from "react-icons/fi";

export default function OperatorButton() {
  const handleClick = () => {
    console.log("Navigate to Operator Registration");
  };

  return (
    <button
      onClick={handleClick}
      className="w-10 h-10 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 transition"
    >
      <FiPlus size={20} />
    </button>
  );
}