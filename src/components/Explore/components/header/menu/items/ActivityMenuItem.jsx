import { HiOutlineBolt } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function ActivityMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineBolt} label={t("explore.menuActivity")} onClick={() => onSelect("activity")} />;
}
