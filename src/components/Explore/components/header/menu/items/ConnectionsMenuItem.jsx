import { HiOutlineUserGroup } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function ConnectionsMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineUserGroup} label={t("explore.menuConnections")} onClick={() => onSelect("connections")} />;
}
