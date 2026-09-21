import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function SignOutMenuItem({ onSignOut }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineArrowRightOnRectangle} label={t("explore.menuSignOut")} onClick={onSignOut} tone="danger" />;
}
