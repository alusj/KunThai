import { HiOutlineQuestionMarkCircle } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function HelpCenterMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineQuestionMarkCircle} label={t("explore.menuHelpCenter")} onClick={() => onSelect("help-center")} />;
}
