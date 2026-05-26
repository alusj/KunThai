import { Plus, Truck } from "lucide-react";

import { PremiumHeaderButton } from "../../../shared/PremiumHeader";

export default function OperatorButton({ hasOperatorAccount, onClick }) {
  if (hasOperatorAccount) {
    return (
      <PremiumHeaderButton active accent="emerald" icon={Truck} label="Open my fleet" onClick={onClick} wide>
        My Fleet
      </PremiumHeaderButton>
    );
  }

  return (
    <PremiumHeaderButton active accent="emerald" icon={Plus} label="Register fleet" onClick={onClick} />
  );
}
