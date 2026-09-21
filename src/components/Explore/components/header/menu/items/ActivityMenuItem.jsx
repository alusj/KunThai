import { HiOutlineBolt } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function ActivityMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineBolt} label={t("explore.menuActivity")} onClick={() => onSelect("activity")} />;
}
