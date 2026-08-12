import { HiOutlineDocumentText } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function MyPostsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineDocumentText} label={t("explore.menuMyPosts")} onClick={() => onSelect("my-posts")} />;
}
