import { Plus } from "lucide-react";

import ActionButton from "./ActionButton";

export default function AddProductAction({ onClick }) {
  return (
    <ActionButton
      icon={<Plus size={20} strokeWidth={2.4} />}
      label="Add New Product"
      onClick={onClick}
    />
  );
}
