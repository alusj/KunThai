import { HiOutlineDocumentText } from "react-icons/hi2";

import MenuActionButton from "../MenuActionButton";

export default function MyPostsMenuItem({ onSelect }) {
  return <MenuActionButton icon={HiOutlineDocumentText} label="My Posts" onClick={() => onSelect("my-posts")} />;
}
