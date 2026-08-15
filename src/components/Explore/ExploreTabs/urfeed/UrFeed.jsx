import { useEffect, useMemo, useRef } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { paceExploreAdvertPosts } from "../../../../Backend/services/exploreService";
import PullToRefresh from "../../../shared/PullToRefresh";
import FeedComposer from "./feed/components/FeedComposer";
import FeedList from "./feed/FeedList";
import { t } from "../../../../i18n";

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

export default function UrFeed({ active = true, focusRequest = null, profile, onViewProfile }) {
  const feed = useExploreFeed("feed");
  const circleFeed = useExploreFeed("connections");
  const handledFocusKeyRef = useRef("");

  useEffect(() => {
    const focusedPost = focusRequest?.post;
    if (!focusedPost?.id) return;

    if (focusedPost.feed_scope === "connections") {
      circleFeed.includePost(focusedPost);
    } else {
      feed.includePost(focusedPost);
    }
    // The request key is the deliberate insertion trigger. Feed hook objects
    // are recreated as their state changes and must not replay this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.key, focusRequest?.post]);
  const posts = useMemo(
    () => {
      const combined = [
        ...feed.posts.map((post) => ({ ...post, contextLabel: "UrFeed" })),
        ...circleFeed.posts.map((post) => ({ ...post, contextLabel: t("explore.fromCircle") })),
      ];
      const deduped = Array.from(new Map(combined.map((post) => [post.id, post])).values());

      const ranked = deduped.sort((first, second) => {
        const firstPinnedAt = Date.parse(first.client_pinned_at || "");
        const secondPinnedAt = Date.parse(second.client_pinned_at || "");
        const firstPinned = Number.isFinite(firstPinnedAt) && Date.now() - firstPinnedAt < 24 * 60 * 60 * 1000;
        const secondPinned = Number.isFinite(secondPinnedAt) && Date.now() - secondPinnedAt < 24 * 60 * 60 * 1000;
        if (firstPinned !== secondPinned) return secondPinned ? 1 : -1;
        if (firstPinned && secondPinned && secondPinnedAt !== firstPinnedAt) return secondPinnedAt - firstPinnedAt;

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

  useEffect(() => {
    const requestKey = focusRequest?.key || "";
    const postId = focusRequest?.postId || "";
    if (!active || !requestKey || !postId || handledFocusKeyRef.current === requestKey) return undefined;
    if (!posts.some((post) => post.id === postId)) return undefined;

    // Wait until the notification screen and tab transition have released
    // their scroll restoration. A deterministic jump is more reliable than a
    // long smooth scroll whose destination shifts as media finishes laying out.
    const focusTimer = window.setTimeout(() => {
      const node = document.getElementById(`post-${postId}`);
      if (!node) return;

      handledFocusKeyRef.current = requestKey;
      node.scrollIntoView({ behavior: "auto", block: "center" });
      node.classList.remove("kt-notification-post-focus");
      void node.offsetWidth;
      node.classList.add("kt-notification-post-focus");

      window.setTimeout(() => {
        node.scrollIntoView({ behavior: "auto", block: "center" });
        if (focusRequest.openComments) {
          window.dispatchEvent(new CustomEvent("explore-open-post-comments", {
            detail: { postId, commentId: focusRequest.commentId || "" },
          }));
        }
      }, 120);
      window.setTimeout(() => node.classList.remove("kt-notification-post-focus"), 2200);
    }, 420);

    return () => window.clearTimeout(focusTimer);
  }, [active, focusRequest, posts]);

  return (
    <PullToRefresh onRefresh={() => Promise.all([feed.reload(), circleFeed.reload()])}>
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
        onLoadMore={() => Promise.all([feed.loadMore(), circleFeed.loadMore()])}
        hasMore={feed.hasMore || circleFeed.hasMore}
        loadingMore={feed.loadingMore || circleFeed.loadingMore}
        currentUserId={profile?.userId}
        onViewProfile={onViewProfile}
        emptyTitle={t("explore.noPostsYet")}
        emptyMessage={t("explore.feedEmptyMsg")}
        actionsByScope={{
          feed: feedActions(feed),
          connections: feedActions(circleFeed),
        }}
        {...feedActions(feed)}
      />
    </PullToRefresh>
  );
}
