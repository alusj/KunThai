import { HiOutlineScale } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function TermsPoliciesMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineScale} label="Terms & Policies" onClick={() => onSelect("terms-policies")} />;
}
