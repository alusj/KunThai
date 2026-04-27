import { HiOutlineBolt } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function ActivityMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineBolt} label="Activity" onClick={() => onSelect("activity")} />;
}
