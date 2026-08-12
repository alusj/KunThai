import { HiOutlineUserGroup } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function ConnectionsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineUserGroup} label={t("explore.menuConnections")} onClick={() => onSelect("connections")} />;
}
