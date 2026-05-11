import { useExploreFeed } from "../../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import VideoCard from "../videos/VideoCard";
import { getSwipContext, getVideoCategoryLabel, getSwipVideos } from "../videos/swipUtils";

export default function All({ currentUserId = "", onlyUserId = "", onViewProfile }) {
  const feed = useExploreFeed("swip");
  const videos = getSwipVideos(feed.posts, onlyUserId);

  if (feed.error) {
    return (
      <div className="p-4">
        <ErrorState message={feed.error} onRetry={feed.reload} />
      </div>
    );
  }

  if (!videos.length) {
    return (
      <div className="p-4">
        <EmptyState
          title="No Swip videos yet"
          message="Videos you post from the composer will appear in Swip automatically."
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-57px)] w-full min-w-0 snap-y snap-mandatory overflow-y-auto bg-slate-950 px-0 py-0 kuntai-scrollbar-none">
      {videos.map((post) => (
        <VideoCard
          key={post.id}
          post={post}
          contextLabel={getSwipContext(post, currentUserId)}
          categoryLabel={getVideoCategoryLabel(post)}
          currentUserId={currentUserId}
          liked={feed.likedPosts.has(post.id)}
          saved={feed.savedPosts.has(post.id)}
          isOwner={Boolean(currentUserId && post.user_id === currentUserId)}
          onLike={() => feed.toggleLike(post.id)}
          onSave={() => feed.toggleSave(post.id)}
          onComment={(body) => feed.addComment(post.id, body)}
          onDelete={() => feed.deletePost(post.id)}
          onViewProfile={() =>
            onViewProfile?.({
              userId: post.user_id || "",
              displayName: post.author_name || "Profile",
              username: post.author_username || "",
              avatarUrl: post.author_avatar_url || "",
              accountType: "personal",
            })
          }
        />
      ))}
    </div>
  );
}
