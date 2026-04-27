import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import FeedSkeleton from "../../ExploreTabs/urfeed/feed/skeletons/FeedSkeleton";
import SocialScreenHeader from "../shared/SocialScreenHeader";

export default function SavedPostsScreen({ currentUserId, hideHeader = false }) {
  const feed = useExploreFeed("feed");
  const savedPosts = feed.posts.filter((post) => feed.savedPosts.has(post.id));

  if (feed.loading) {
    return <FeedSkeleton />;
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Saved Posts" subtitle="Posts you saved from your Explore feed." /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        {feed.error ? <ErrorState message={feed.error} onRetry={feed.reload} /> : null}

        {!savedPosts.length ? (
          <EmptyState title="No saved posts yet" message="Use the post menu to save posts you want to revisit." />
        ) : (
          savedPosts.map((post) => {
            const isOwner = Boolean(currentUserId && post.user_id === currentUserId);

            return (
              <FeedPost
                key={post.id}
                post={post}
                liked={feed.likedPosts.has(post.id)}
                saved
                isOwner={isOwner}
                onLike={() => feed.toggleLike(post.id)}
                onSave={() => feed.toggleSave(post.id)}
                onComment={() => feed.addComment(post.id)}
                onEdit={() => feed.editPost(post.id)}
                onDelete={() => feed.deletePost(post.id)}
                onHide={() => feed.hidePost(post.id)}
                onReport={() => feed.reportPost(post.id)}
                onViewActivity={() => feed.viewActivity(post.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
