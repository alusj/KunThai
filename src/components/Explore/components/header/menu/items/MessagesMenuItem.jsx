import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";
import { t } from "../../../../../../i18n";

export default function MessagesMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineChatBubbleLeftRight} label={t("explore.menuMessages")} onClick={() => onSelect("messages")} />;
}
