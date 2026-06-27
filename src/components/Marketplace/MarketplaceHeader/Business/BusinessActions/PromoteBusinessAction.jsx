import { Megaphone } from "lucide-react";

import ActionButton from "./ActionButton";

export default function PromoteBusinessAction({ onClick }) {
  return (
    <ActionButton
      icon={<Megaphone size={20} strokeWidth={2.4} />}
      label="Promote Business"
      onClick={onClick}
    />
  );
}
