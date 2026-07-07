import { Fragment, useEffect, useRef, useState } from "react";
import { UserRoundPlus } from "lucide-react";

import supabase from "../../../../../Backend/lib/supabaseClient";
import { useExploreFollows } from "../../../../../Backend/hooks/useExploreFollows";
import { readExploreSettings } from "../../../../../Backend/services/explore/preferencesService";
import { isAdvertPost } from "../../../shared/advertUtils";
import { recordExploreAdvertEvent, recordRecommendationSignal } from "../../../../../Backend/services/exploreService";
import Avatar from "../../../shared/Avatar";
import EmptyState from "../../../shared/EmptyState";
import FeedPost from "./components/FeedPost";

export default function FeedList({
  posts,
  loading,
  error,
  likedPosts,
  savedPosts,
  onLike,
  onSave,
  onCommentCountChange,
  onEdit,
  onDelete,
  onHide,
  onMuteAdvertiser,
  onReport,
  onViewActivity,
  onViewProfile,
  currentUserId,
  actionsByScope,
  profile,
  emptyTitle = "No posts yet",
  emptyMessage = "The feed is empty right now. Be the first to share something.",
  showEmpty = false,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}) {
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);

  async function handleFollow(post) {
    const active = await toggleFollow(post.user_id);

    if (active && post.user_id) {
      return "Following";
    }

    return active === false ? "Unfollowed" : "";
  }

  if ((loading || error) && !posts?.length) {
    return <FeedListSkeleton />;
  }

  if (!posts?.length) {
    if (!showEmpty) {
      return null;
    }

    return (
      <div className="mt-4 w-full overflow-x-clip px-4 sm:px-5 lg:px-8">
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    );
  }

  const suggestionsEnabled = readExploreSettings().feed.showSuggestedAccounts !== false;

  return (
    <div className="mt-4 w-full overflow-x-clip px-4 pb-8 sm:px-5 lg:px-8">
      <div className="w-full max-w-full space-y-4 overflow-x-clip">
        {(posts || []).map((post, postIndex) => (
          <Fragment key={post.id}>
          <ObservedFeedPost post={post}>
            <FeedPost
            post={post}
            profile={profile}
            currentUserId={currentUserId}
            liked={(actionsByScope?.[post.feed_scope || "feed"]?.likedPosts || likedPosts)?.has?.(post.id)}
            saved={(actionsByScope?.[post.feed_scope || "feed"]?.savedPosts || savedPosts)?.has?.(post.id)}
            onLike={() => (actionsByScope?.[post.feed_scope || "feed"]?.onLike || onLike)?.(post.id)}
            onSave={() => (actionsByScope?.[post.feed_scope || "feed"]?.onSave || onSave)?.(post.id)}
            onCommentCountChange={(delta) => (actionsByScope?.[post.feed_scope || "feed"]?.onCommentCountChange || onCommentCountChange)?.(post.id, delta)}
            onEdit={(body) => (actionsByScope?.[post.feed_scope || "feed"]?.onEdit || onEdit)?.(post.id, body)}
            onDelete={() => (actionsByScope?.[post.feed_scope || "feed"]?.onDelete || onDelete)?.(post.id, { confirm: false })}
            onHide={() => (actionsByScope?.[post.feed_scope || "feed"]?.onHide || onHide)?.(post.id)}
            onMuteAdvertiser={() => (actionsByScope?.[post.feed_scope || "feed"]?.onMuteAdvertiser || onMuteAdvertiser)?.(post.id)}
            onReport={(reason) => (actionsByScope?.[post.feed_scope || "feed"]?.onReport || onReport)?.(post.id, reason)}
            onViewActivity={() => (actionsByScope?.[post.feed_scope || "feed"]?.onViewActivity || onViewActivity)?.(post.id)}
            onViewProfile={() =>
              onViewProfile?.({
                userId: post.user_id || "",
                displayName: post.author_name || "Profile",
                username: post.author_username || "",
                avatarUrl: post.author_avatar_url || "",
                accountType: "personal",
              })
            }
            followed={Boolean(post.user_id && followedUsers.has(post.user_id))}
            onFollow={() => handleFollow(post)}
            isOwner={Boolean(currentUserId && post.user_id === currentUserId)}
            />
          </ObservedFeedPost>
          {postIndex === 2 && suggestionsEnabled ? (
            <SuggestedAccountsCard
              currentUserId={currentUserId}
              followedUsers={followedUsers}
              onToggleFollow={toggleFollow}
              onViewProfile={onViewProfile}
            />
          ) : null}
          </Fragment>
        ))}
      </div>

      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-auto mt-5 block rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-sky-700 shadow-sm disabled:opacity-60"
        >
          {loadingMore ? "Loading more..." : "Show more"}
        </button>
      ) : (
        <p className="py-5 text-center text-sm font-bold text-slate-400">You are all caught up.</p>
      )}
    </div>
  );
}

function SuggestedAccountsCard({ currentUserId, followedUsers, onToggleFollow, onViewProfile }) {
  const [profiles, setProfiles] = useState([]);
  const [pendingIds, setPendingIds] = useState(() => new Set());

  useEffect(() => {
    let alive = true;

    supabase
      .from("explore_profiles")
      .select("user_id, display_name, username, avatar_url, account_type")
      .is("deactivated_at", null)
      .order("updated_at", { ascending: false })
      .limit(12)
      .then(({ data, error }) => {
        if (!alive || error) return;
        setProfiles((data || []).filter((profile) => profile.user_id && profile.user_id !== currentUserId));
      });

    return () => {
      alive = false;
    };
  }, [currentUserId]);

  const visible = profiles.filter((profile) => !followedUsers.has(profile.user_id)).slice(0, 3);
  if (!visible.length) return null;

  async function followSuggestion(userId) {
    setPendingIds((current) => new Set(current).add(userId));
    try {
      await onToggleFollow(userId);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-sky-50 text-sky-700">
          <UserRoundPlus size={17} />
        </span>
        <h3 className="text-sm font-black text-slate-950">Suggested accounts</h3>
      </div>
      <div className="mt-3 space-y-2">
        {visible.map((profile) => (
          <div key={profile.user_id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
            <button
              type="button"
              onClick={() =>
                onViewProfile?.({
                  userId: profile.user_id,
                  displayName: profile.display_name || "Profile",
                  username: profile.username || "",
                  avatarUrl: profile.avatar_url || "",
                  accountType: profile.account_type || "personal",
                })
              }
              className="kt-pressable flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left"
            >
              <Avatar name={profile.display_name || profile.username} src={profile.avatar_url} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-950">{profile.display_name || "Profile"}</span>
                <span className="block truncate text-xs font-bold text-slate-500">@{profile.username || "user"}</span>
              </span>
            </button>
            <button
              type="button"
              disabled={pendingIds.has(profile.user_id)}
              onClick={() => followSuggestion(profile.user_id)}
              className="kt-pressable h-9 flex-none rounded-2xl bg-sky-700 px-4 text-xs font-black text-white transition hover:bg-sky-800 disabled:opacity-60"
            >
              Follow
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

const IMPRESSION_SESSION = new Set();
const VIEW_SESSION = new Set();

function ObservedFeedPost({ children, post }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !post?.id || typeof IntersectionObserver === "undefined") return undefined;

    let viewTimer = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          window.clearTimeout(viewTimer);
          viewTimer = null;
          return;
        }

        if (!IMPRESSION_SESSION.has(post.id)) {
          IMPRESSION_SESSION.add(post.id);
          recordRecommendationSignal(post, "impression", { surface: "urfeed" }).catch(() => false);
          if (isAdvertPost(post)) recordExploreAdvertEvent(post, "impression", { surface: "urfeed" }).catch(() => false);
        }

        if (!VIEW_SESSION.has(post.id) && !viewTimer) {
          viewTimer = window.setTimeout(() => {
            VIEW_SESSION.add(post.id);
            recordRecommendationSignal(post, "view", { surface: "urfeed" }).catch(() => false);
            if (isAdvertPost(post)) recordExploreAdvertEvent(post, "view", { surface: "urfeed" }).catch(() => false);
          }, 1200);
        }
      },
      { threshold: 0.55 },
    );

    observer.observe(node);
    return () => {
      window.clearTimeout(viewTimer);
      observer.disconnect();
    };
  }, [post]);

  return <div ref={containerRef}>{children}</div>;
}

function FeedListSkeleton() {
  return (
    <div className="mt-4 w-full overflow-x-clip px-4 pb-8 sm:px-5 lg:px-8">
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <article key={item} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 max-w-full animate-pulse rounded-full bg-slate-200" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 h-40 animate-pulse rounded-[22px] bg-slate-100" />
          </article>
        ))}
      </div>
    </div>
  );
}
