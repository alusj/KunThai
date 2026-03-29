// src/Explore/ExploreTabs/urfeed/FeedList.jsx
// ------------------------------------------
// Renders a list of feed posts
// ------------------------------------------

import FeedPost from "./components/FeedPost";

export default function FeedList() {
  return (
    <div className="px-3 pt-3">

      <FeedPost
        author="Alus Jay"
        time="2 mins ago"
        content="This is my first post on UrSalone 🚀"
      />

      <FeedPost
        author="UrSalone Team"
        time="1 hour ago"
        content="Welcome to the future of social platforms in Africa."
      />

    </div>
  );
}
