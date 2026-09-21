import { HiOutlineBookmark } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function SavedPostsMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineBookmark} label={t("explore.menuSavedPosts")} onClick={() => onSelect("saved-posts")} />;
}
