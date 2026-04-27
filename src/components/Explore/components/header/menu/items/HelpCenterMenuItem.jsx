import { HiOutlineQuestionMarkCircle } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function HelpCenterMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineQuestionMarkCircle} label="Help Center" onClick={() => onSelect("help-center")} />;
}
