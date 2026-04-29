import { HiOutlineRocketLaunch } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function FutureFeaturesMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineRocketLaunch} label="Future Features" onClick={() => onSelect("future-features")} />;
}
