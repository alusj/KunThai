import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function MessagesMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineChatBubbleLeftRight} label="Messages" onClick={() => onSelect("messages")} />;
}
