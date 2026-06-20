import { useMemo } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import FeedComposer from "./feed/components/FeedComposer";
import FeedList from "./feed/FeedList";

function feedActions(feed) {
  return {
    likedPosts: feed.likedPosts,
    savedPosts: feed.savedPosts,
    onLike: feed.toggleLike,
    onSave: feed.toggleSave,
    onComment: feed.addComment,
    onCommentCountChange: feed.bumpCommentCount,
    onEdit: feed.editPost,
    onDelete: feed.deletePost,
    onHide: feed.hidePost,
    onReport: feed.reportPost,
    onViewActivity: feed.viewActivity,
  };
}

export default function UrFeed({ profile, onViewProfile }) {
  const feed = useExploreFeed("feed");
  const circleFeed = useExploreFeed("connections");
  const posts = useMemo(
    () =>
      [
        ...feed.posts.map((post) => ({ ...post, contextLabel: "UrFeed" })),
        ...circleFeed.posts.map((post) => ({ ...post, contextLabel: "From your circle" })),
      ].sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0)),
    [feed.posts, circleFeed.posts],
  );

  return (
    <div>
      <FeedComposer
        profile={profile}
        creating={feed.creating}
        onSubmit={(postInput) => feed.submitPost(postInput)}
      />
      <FeedList
        profile={profile}
        posts={posts}
        loading={(feed.loading || circleFeed.loading) && posts.length === 0}
        error={feed.error || circleFeed.error}
        onRetry={() => Promise.all([feed.reload(), circleFeed.reload()])}
        currentUserId={profile?.userId}
        onViewProfile={onViewProfile}
        emptyTitle="No posts yet"
        emptyMessage="Feed posts and circle updates will appear here."
        actionsByScope={{
          feed: feedActions(feed),
          connections: feedActions(circleFeed),
        }}
        {...feedActions(feed)}
      />
    </div>
  );
}
