import { HiOutlineUserGroup } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function ConnectionsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineUserGroup} label="Connections" onClick={() => onSelect("connections")} />;
}
