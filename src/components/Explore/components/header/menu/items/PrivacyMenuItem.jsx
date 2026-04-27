import { HiOutlineShieldCheck } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function PrivacyMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineShieldCheck} label="Privacy" onClick={() => onSelect("privacy")} />;
}
