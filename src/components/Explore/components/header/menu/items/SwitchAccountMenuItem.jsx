import { HiOutlineArrowsRightLeft } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function SwitchAccountMenuItem({ onSwitchAccount }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineArrowsRightLeft} label={t("explore.menuSwitchAccount")} onClick={onSwitchAccount} tone="strong" />;
}
