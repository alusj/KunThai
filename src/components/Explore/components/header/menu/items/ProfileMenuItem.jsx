import { HiOutlineUser } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function ProfileMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineUser} label={t("explore.menuProfile")} onClick={() => onSelect("profile")} />;
}
