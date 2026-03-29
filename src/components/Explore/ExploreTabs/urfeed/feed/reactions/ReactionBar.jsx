// src/explore/urfeed/feed/reactions/ReactionBar.jsx
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";

/*
  ReactionBar.jsx
  ----------------
  Post interactions
*/

export default function ReactionBar() {
  return (
    <div className="flex gap-4">
      <LikeButton />
      <SaveButton />
    </div>
  );
}
