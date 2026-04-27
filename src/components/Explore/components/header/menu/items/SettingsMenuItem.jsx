import { HiOutlineCog6Tooth } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function SettingsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineCog6Tooth} label="Settings" onClick={() => onSelect("settings")} />;
}
