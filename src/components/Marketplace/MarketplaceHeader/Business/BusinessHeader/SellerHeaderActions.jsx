import { Menu, Plus } from "lucide-react";

import HeaderActionButton from "./HeaderActionButton";

export default function SellerHeaderActions({
  onAddProduct,
  onMenu,
}) {
  return (
    <div className="flex items-center gap-2">
      <HeaderActionButton
        icon={Plus}
        label="Add Product"
        primary
        onClick={onAddProduct}
      />
      <button
        type="button"
        onClick={onMenu}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
        aria-label="Open menu"
        title="Menu"
      >
        <Menu size={20} strokeWidth={2.3} />
      </button>
    </div>
  );
}
