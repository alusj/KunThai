import { HiOutlineScale } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function TermsPoliciesMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineScale} label={t("explore.menuPolicyCenter")} onClick={() => onSelect("terms-policies")} />;
}
