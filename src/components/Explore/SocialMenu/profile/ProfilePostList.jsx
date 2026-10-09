import { canManageExplorePost } from "../../../../Backend/services/explore/profilePostsModel";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import ProfileSwipGrid from "./ProfileSwipGrid";
import { buildListActions } from "./profileListActions";

export function PostListStatus({ list, emptyTitle, emptyMessage, errorMessage }) {
  const { t } = useI18n();
  if (list.loading && !list.posts.length) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="sr-only">{t("exploreProfileFix.loadingPosts")}</p>
        {[0, 1].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-[24px] bg-slate-100" />
        ))}
      </div>
    );
  }
  if (list.error && !list.posts.length) {
    return <ErrorState message={errorMessage || t("exploreProfileFix.postsLoadFailed")} onRetry={list.reload} />;
  }
  if (!list.posts.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return null;
}

export function LoadMoreButton({ list }) {
  const { t } = useI18n();
  if (!list.hasMore || !list.posts.length) return null;
  return (
    <button
      type="button"
      onClick={list.loadMore}
      disabled={list.loadingMore}
      className="kt-pressable h-11 w-full rounded-2xl bg-white text-sm font-black text-slate-700 shadow-sm disabled:opacity-60"
    >
      {list.loadingMore ? t("exploreProfileFix.loadingPosts") : t("exploreProfileFix.loadMore")}
    </button>
  );
}

// Feed posts (cards) or Swips (grid) from a server list, with loading, error
// with retry, empty and "load more" states.
export default function ProfilePostList({
  list,
  reactions,
  surface = "feed",
  currentUserId = "",
  spaces = [],
  emptyTitle,
  emptyMessage,
  onReport,
  onHide,
}) {
  const actions = buildListActions(list, reactions);
  const status = <PostListStatus list={list} emptyTitle={emptyTitle} emptyMessage={emptyMessage} />;
  if (!list.posts.length) return status;

  const canManage = (post) => canManageExplorePost(post, { currentUserId, spaces });

  if (surface === "swip") {
    const owned = list.posts.length > 0 && list.posts.every(canManage);
    return (
      <div className="space-y-3">
        <ProfileSwipGrid posts={list.posts} feed={actions} currentUserId={currentUserId} isOwner={owned} />
        <LoadMoreButton list={list} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {list.posts.map((post) => (
        post.video_url ? (
          <VideoCard
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            liked={actions.likedPosts.has(post.id)}
            saved={actions.savedPosts.has(post.id)}
            isOwner={canManage(post)}
            onLike={() => actions.toggleLike(post.id)}
            onSave={() => actions.toggleSave(post.id)}
            onComment={(delta) => actions.bumpCommentCount(post.id, typeof delta === "number" ? delta : 1)}
            onDelete={() => actions.deletePost(post.id)}
          />
        ) : (
          <FeedPost
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            isOwner={canManage(post)}
            liked={actions.likedPosts.has(post.id)}
            saved={actions.savedPosts.has(post.id)}
            onLike={() => actions.toggleLike(post.id)}
            onSave={() => actions.toggleSave(post.id)}
            onCommentCountChange={(delta) => actions.bumpCommentCount(post.id, delta)}
            onEdit={(body) => actions.editPost(post.id, body)}
            onDelete={() => actions.deletePost(post.id)}
            onHide={onHide ? () => onHide(post.id) : undefined}
            onReport={onReport ? (reason) => onReport(post.id, reason) : undefined}
          />
        )
      ))}
      <LoadMoreButton list={list} />
    </div>
  );
}
