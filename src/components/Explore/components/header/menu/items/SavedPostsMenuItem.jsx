import { HiOutlineBookmark } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function SavedPostsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineBookmark} label={t("explore.menuSavedPosts")} onClick={() => onSelect("saved-posts")} />;
}
