import { Settings } from "lucide-react";

import ActionButton from "./ActionButton";

export default function ManageStoreAction({ onClick }) {
  return (
    <ActionButton
      icon={<Settings size={20} strokeWidth={2.4} />}
      label="Manage Store"
      onClick={onClick}
    />
  );
}
