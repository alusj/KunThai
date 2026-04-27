import { useEffect, useState } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import FeedTabs from "./FeedTabs";
import FeedComposer from "./feed/components/FeedComposer";
import FeedList from "./feed/FeedList";

function feedActions(feed) {
  return {
    likedPosts: feed.likedPosts,
    savedPosts: feed.savedPosts,
    onLike: feed.toggleLike,
    onSave: feed.toggleSave,
    onComment: feed.addComment,
    onEdit: feed.editPost,
    onDelete: feed.deletePost,
    onHide: feed.hidePost,
    onReport: feed.reportPost,
    onViewActivity: feed.viewActivity,
  };
}

export default function UrFeed({ profile, onViewProfile }) {
  const [activeTab, setActiveTab] = useState("feed");
  const feed = useExploreFeed("feed");
  const swipFeed = useExploreFeed("swip");
  const circleFeed = useExploreFeed("connections");

  useEffect(() => {
    function handleCreatePost() {
      setActiveTab("feed");
    }

    window.addEventListener("explore-create-post", handleCreatePost);
    return () => window.removeEventListener("explore-create-post", handleCreatePost);
  }, []);

  return (
    <div>
      <FeedTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "feed" && (
        <>
          <FeedComposer
            profile={profile}
            creating={feed.creating || swipFeed.creating}
            onSubmit={(postInput) => (postInput?.video_url ? swipFeed.submitPost(postInput) : feed.submitPost(postInput))}
          />
          <FeedList
            posts={feed.posts}
            loading={feed.loading}
            error={feed.error}
            onRetry={feed.reload}
            currentUserId={profile?.userId}
            onViewProfile={onViewProfile}
            {...feedActions(feed)}
          />
        </>
      )}

      {activeTab === "connections" && (
        <FeedList
          posts={circleFeed.posts}
          loading={circleFeed.loading}
          error={circleFeed.error}
          onRetry={circleFeed.reload}
          currentUserId={profile?.userId}
          onViewProfile={onViewProfile}
          emptyTitle="No circle posts yet"
          emptyMessage="Posts from people in your circle will appear here."
          {...feedActions(circleFeed)}
        />
      )}
    </div>
  );
}
