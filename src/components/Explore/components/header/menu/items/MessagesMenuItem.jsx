import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";
import { useI18n as useUiLocale } from "../../../../../../i18n/index.js";

export default function MessagesMenuItem({ onSelect }) {
  useUiLocale();
  return <MenuActionButton icon={HiOutlineChatBubbleLeftRight} label={t("explore.menuMessages")} onClick={() => onSelect("messages")} />;
}
