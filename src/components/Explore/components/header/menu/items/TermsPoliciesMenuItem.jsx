import { HiOutlineScale } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function TermsPoliciesMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineScale} label={t("explore.menuPolicyCenter")} onClick={() => onSelect("terms-policies")} />;
}
