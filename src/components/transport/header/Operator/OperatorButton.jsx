import { Building2, Plus, Truck } from "lucide-react";

import { PremiumHeaderButton } from "../../../shared/PremiumHeader";

export default function OperatorButton({ badge = 0, hasCompanyAccount, hasOperatorAccount, onClick }) {
  if (hasOperatorAccount) {
    return (
      <PremiumHeaderButton active accent="emerald" badge={badge} icon={Truck} label="Open my fleet" onClick={onClick} wide>
        My Fleet
      </PremiumHeaderButton>
    );
  }

  if (hasCompanyAccount) {
    return (
      <PremiumHeaderButton active accent="emerald" badge={badge} icon={Building2} label="Open Fleet HQ" onClick={onClick} wide>
        Fleet HQ
      </PremiumHeaderButton>
    );
  }

  return (
    <PremiumHeaderButton active accent="emerald" icon={Plus} label="Register fleet" onClick={onClick} />
  );
}
