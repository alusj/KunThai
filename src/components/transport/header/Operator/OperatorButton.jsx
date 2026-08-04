import { Building2, Plus, Truck } from "lucide-react";

import { PremiumHeaderButton } from "../../../shared/PremiumHeader";
import { useI18n, t } from "../../../../i18n";

export default function OperatorButton({ badge = 0, hasCompanyAccount, hasOperatorAccount, onClick }) {
  useI18n();
  if (hasOperatorAccount) {
    return <PremiumHeaderButton active accent="emerald" badge={badge} icon={Truck} label={t("urride.header.openMyFleet")} onClick={onClick} />;
  }

  if (hasCompanyAccount) {
    return <PremiumHeaderButton active accent="emerald" badge={badge} icon={Building2} label={t("urride.header.openFleetHq")} onClick={onClick} />;
  }

  return <PremiumHeaderButton active accent="emerald" icon={Plus} label={t("urride.header.registerFleet")} onClick={onClick} />;
}
