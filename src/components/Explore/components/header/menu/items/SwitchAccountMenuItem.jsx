import { HiOutlineArrowsRightLeft } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function SwitchAccountMenuItem({ onSwitchAccount }) {
  return <MenuActionButton icon={HiOutlineArrowsRightLeft} label={t("explore.menuSwitchAccount")} onClick={onSwitchAccount} tone="strong" />;
}
