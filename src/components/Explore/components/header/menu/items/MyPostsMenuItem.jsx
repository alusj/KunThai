import { HiOutlineDocumentText } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function MyPostsMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineDocumentText} label={t("explore.menuMyPosts")} onClick={() => onSelect("my-posts")} />;
}
