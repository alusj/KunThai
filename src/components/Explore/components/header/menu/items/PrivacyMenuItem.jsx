import { HiOutlineShieldCheck } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function PrivacyMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineShieldCheck} label={t("explore.menuPrivacy")} onClick={() => onSelect("privacy")} />;
}
