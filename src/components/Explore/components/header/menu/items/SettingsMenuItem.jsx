import { HiOutlineCog6Tooth } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function SettingsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineCog6Tooth} label={t("explore.menuSettings")} onClick={() => onSelect("settings")} />;
}
