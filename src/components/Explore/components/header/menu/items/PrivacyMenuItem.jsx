import { HiOutlineShieldCheck } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function PrivacyMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineShieldCheck} label={t("explore.menuPrivacy")} onClick={() => onSelect("privacy")} />;
}
