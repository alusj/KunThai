import { HiOutlineUser } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function ProfileMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineUser} label={t("explore.menuProfile")} onClick={() => onSelect("profile")} />;
}
