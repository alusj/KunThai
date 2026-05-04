// MenuButton.jsx
// Buyer utility menu button in header

import { Menu as MenuIcon } from "lucide-react";

export default function MenuButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-800 transition hover:bg-gray-200"
      aria-label="Open buyer menu"
    >
      <MenuIcon size={20} />
    </button>
  );
}
