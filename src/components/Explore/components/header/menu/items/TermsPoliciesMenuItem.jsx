import { HiOutlineScale } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function TermsPoliciesMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineScale} label="Policy Center" onClick={() => onSelect("terms-policies")} />;
}
