import { HiOutlineBookmark } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function SavedPostsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineBookmark} label="Saved Posts" onClick={() => onSelect("saved-posts")} />;
}
