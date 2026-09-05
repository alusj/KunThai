import { Building2, Plus, Truck } from "lucide-react";

import { PremiumHeaderButton } from "../../../shared/PremiumHeader";
import { useI18n, t } from "../../../../i18n";

export default function OperatorButton({ badge = 0, disabled = false, hasCompanyAccount, hasOperatorAccount, onClick }) {
  useI18n();
  // Icon sized to 18 (vs the default 20) so the filled emerald operator button
  // reads at the same visual weight as the outline header buttons beside it,
  // instead of looking oversized.
  if (hasOperatorAccount) {
    return <PremiumHeaderButton active accent="emerald" badge={badge} disabled={disabled} icon={Truck} iconSize={18} label={t("urride.header.openMyFleet")} onClick={onClick} />;
  }

  if (hasCompanyAccount) {
    return <PremiumHeaderButton active accent="emerald" badge={badge} disabled={disabled} icon={Building2} iconSize={18} label={t("urride.header.openFleetHq")} onClick={onClick} />;
  }

  return <PremiumHeaderButton active accent="emerald" disabled={disabled} icon={Plus} iconSize={18} label={t("urride.header.registerFleet")} onClick={onClick} />;
}
