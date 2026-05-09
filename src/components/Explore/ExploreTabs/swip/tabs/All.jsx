import { useExploreFeed } from "../../../../../Backend/hooks/useExploreFeed";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import VideoCard from "../videos/VideoCard";
import { filterSwipVideos } from "../videos/swipUtils";

export default function All({ category = "all", currentUserId = "", onlyUserId = "", onViewProfile }) {
  const feed = useExploreFeed("swip");
  const videos = filterSwipVideos(feed.posts, category, onlyUserId);

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
          title={category === "all" ? "No Swip videos yet" : "No videos in this category yet"}
          message="Videos you post from the composer will appear in Swip automatically."
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-176px)] w-full min-w-0 snap-y snap-mandatory space-y-4 overflow-y-auto px-3 py-4 sm:h-[calc(100vh-188px)] sm:px-5 kuntai-scrollbar-none">
      {videos.map((post) => (
        <VideoCard
          key={post.id}
          post={post}
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
