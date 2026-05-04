// CartButton.jsx
// Header cart icon with badge

import { ShoppingCart } from "lucide-react";

export default function CartButton({ count, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-800 transition hover:bg-gray-200"
      aria-label="Open cart"
    >
      <ShoppingCart size={19} />
      {count > 0 && (
        <span className="absolute -right-2 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-xs font-black text-white">
          {count}
        </span>
      )}
    </button>
  );
}
