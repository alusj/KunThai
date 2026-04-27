import { HiOutlineUser } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function ProfileMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineUser} label="Profile" onClick={() => onSelect("profile")} />;
}
