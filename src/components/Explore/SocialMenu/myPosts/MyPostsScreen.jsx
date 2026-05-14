import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import SocialScreenHeader from "../shared/SocialScreenHeader";

export default function MyPostsScreen({ currentUserId, hideHeader = false }) {
  const feed = useExploreFeed("feed");
  const myPosts = feed.posts.filter((post) => post.user_id === currentUserId);

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="My Posts" subtitle="Posts you have shared on Explore." /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        {feed.error ? <ErrorState message={feed.error} onRetry={feed.reload} /> : null}

        {!myPosts.length ? (
          <EmptyState title="No posts yet" message="When you share something, it will appear here." />
        ) : (
          myPosts.map((post) => (
            <FeedPost
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              liked={feed.likedPosts.has(post.id)}
              saved={feed.savedPosts.has(post.id)}
              isOwner
              onLike={() => feed.toggleLike(post.id)}
              onSave={() => feed.toggleSave(post.id)}
              onComment={() => feed.addComment(post.id)}
              onEdit={(body) => feed.editPost(post.id, body)}
              onDelete={() => feed.deletePost(post.id, { confirm: false })}
              onViewActivity={() => feed.viewActivity(post.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
