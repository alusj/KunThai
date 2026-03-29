// src/explore/urfeed/feed/post/PostCard.jsx
import ReactionBar from "../reactions/ReactionBar";

/*
  PostCard.jsx
  ------------
  Single post UI container
*/

export default function PostCard() {
  return (
    <div className="border p-2 my-2">
      <p>This is a post</p>
      <ReactionBar />
    </div>
  );
}
