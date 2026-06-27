import { Package } from "lucide-react";

import ActionButton from "./ActionButton";

export default function ViewOrdersAction({ onClick }) {
  return (
    <ActionButton
      icon={<Package size={20} strokeWidth={2.4} />}
      label="View Orders"
      onClick={onClick}
    />
  );
}
