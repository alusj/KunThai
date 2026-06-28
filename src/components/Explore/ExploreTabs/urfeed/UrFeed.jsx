import { useMemo } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { paceExploreAdvertPosts } from "../../../../Backend/services/exploreService";
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
    onMuteAdvertiser: feed.muteAdvertiser,
    onReport: feed.reportPost,
    onViewActivity: feed.viewActivity,
  };
}

export default function UrFeed({ profile, onViewProfile }) {
  const feed = useExploreFeed("feed");
  const circleFeed = useExploreFeed("connections");
  const posts = useMemo(
    () => {
      const combined = [
        ...feed.posts.map((post) => ({ ...post, contextLabel: "UrFeed" })),
        ...circleFeed.posts.map((post) => ({ ...post, contextLabel: "From your circle" })),
      ];
      const deduped = Array.from(new Map(combined.map((post) => [post.id, post])).values());

      const ranked = deduped.sort((first, second) => {
        const firstScore = Number(first.recommendation_score ?? first.score);
        const secondScore = Number(second.recommendation_score ?? second.score);
        if (Number.isFinite(firstScore) || Number.isFinite(secondScore)) {
          const difference = (Number.isFinite(secondScore) ? secondScore : 0) - (Number.isFinite(firstScore) ? firstScore : 0);
          if (difference !== 0) return difference;
        }
        return new Date(second.created_at || 0) - new Date(first.created_at || 0);
      });
      return paceExploreAdvertPosts(ranked, "feed", profile?.userId || "");
    },
    [feed.posts, circleFeed.posts, profile?.userId],
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
        onLoadMore={() => Promise.all([feed.loadMore(), circleFeed.loadMore()])}
        hasMore={feed.hasMore || circleFeed.hasMore}
        loadingMore={feed.loadingMore || circleFeed.loadingMore}
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
