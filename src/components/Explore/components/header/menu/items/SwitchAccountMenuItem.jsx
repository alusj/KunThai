import { HiOutlineArrowsRightLeft } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function SwitchAccountMenuItem({ onSwitchAccount }) {
  return <MenuActionButton icon={HiOutlineArrowsRightLeft} label="Switch Account" onClick={onSwitchAccount} tone="strong" />;
}
