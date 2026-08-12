import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function SignOutMenuItem({ onSignOut }) {
  return <MenuActionButton icon={HiOutlineArrowRightOnRectangle} label={t("explore.menuSignOut")} onClick={onSignOut} tone="danger" />;
}
