import { HiOutlineArrowRightOnRectangle } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function SignOutMenuItem({ onSignOut }) {
  return <MenuActionButton icon={HiOutlineArrowRightOnRectangle} label="Sign Out" onClick={onSignOut} tone="danger" />;
}
