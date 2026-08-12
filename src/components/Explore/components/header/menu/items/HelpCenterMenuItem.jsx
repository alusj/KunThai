import { HiOutlineQuestionMarkCircle } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function HelpCenterMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineQuestionMarkCircle} label={t("explore.menuHelpCenter")} onClick={() => onSelect("help-center")} />;
}
