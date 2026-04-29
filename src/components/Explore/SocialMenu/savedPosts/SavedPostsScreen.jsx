import { useMemo, useState } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useSavedCollections } from "../../../../Backend/hooks/useSavedCollections";
import { showToast } from "../../../../Backend/services/toastService";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import FeedSkeleton from "../../ExploreTabs/urfeed/feed/skeletons/FeedSkeleton";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import CollectionPicker from "./CollectionPicker";
import SavedFilters from "./SavedFilters";
import SavedToolbar from "./SavedToolbar";

function searchableText(post) {
  return [post.body, post.author_name, post.author_username, ...(post.hashtags || [])].filter(Boolean).join(" ").toLowerCase();
}

function sortSaved(items) {
  return [...items].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export default function SavedPostsScreen({ currentUserId, hideHeader = false }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const feed = useExploreFeed("feed");
  const swip = useExploreFeed("swip");
  const collections = useSavedCollections();

  const savedItems = useMemo(() => {
    const feedItems = feed.posts.filter((post) => feed.savedPosts.has(post.id)).map((post) => ({ ...post, savedType: "feed" }));
    const swipItems = swip.posts.filter((post) => swip.savedPosts.has(post.id)).map((post) => ({ ...post, savedType: "swip" }));
    const unique = Array.from(new Map([...feedItems, ...swipItems].map((post) => [post.id, post])).values());
    return sortSaved(unique);
  }, [feed.posts, feed.savedPosts, swip.posts, swip.savedPosts]);

  const visibleItems = savedItems.filter((post) => {
    const value = query.trim().toLowerCase();
    const activeCollection = collections.collections.find((collection) => collection.id === filter);

    if (filter === "feed" && post.savedType !== "feed") return false;
    if (filter === "swip" && post.savedType !== "swip") return false;
    if (activeCollection && !activeCollection.postIds?.includes(post.id)) return false;
    if (value && !searchableText(post).includes(value)) return false;
    return true;
  });

  function createCollection() {
    const name = window.prompt("Collection name");
    if (name?.trim()) {
      collections.createCollection(name);
      showToast("Collection created.", "success");
    }
  }

  if (feed.loading || swip.loading) {
    return <FeedSkeleton />;
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Saved & Collections" subtitle="Your private saved posts, videos, and folders." /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        {feed.error ? <ErrorState message={feed.error} onRetry={feed.reload} /> : null}
        {swip.error ? <ErrorState message={swip.error} onRetry={swip.reload} /> : null}

        <SavedToolbar query={query} onCreateCollection={createCollection} onQueryChange={setQuery} />
        <SavedFilters active={filter} collections={collections.collections} onChange={setFilter} />

        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
          {savedItems.length} private saved item{savedItems.length === 1 ? "" : "s"}
        </div>

        {!visibleItems.length ? (
          <EmptyState
            title="No saved items here"
            message="Save posts or videos, then organize them into collections you can revisit privately."
          />
        ) : (
          <div className="space-y-4">
            {visibleItems.map((post) => {
              const isOwner = Boolean(currentUserId && post.user_id === currentUserId);
              const sourceFeed = post.savedType === "swip" ? swip : feed;

              return (
                <div key={post.id}>
                  <CollectionPicker
                    collections={collections.collections}
                    postId={post.id}
                    onToggle={collections.toggleItem}
                  />

                  {post.savedType === "swip" ? (
                    <VideoCard
                      post={post}
                      currentUserId={currentUserId}
                      liked={swip.likedPosts.has(post.id)}
                      saved
                      isOwner={isOwner}
                      onLike={() => swip.toggleLike(post.id)}
                      onSave={() => swip.toggleSave(post.id)}
                      onComment={(body) => swip.addComment(post.id, body)}
                      onDelete={() => swip.deletePost(post.id)}
                    />
                  ) : (
                    <FeedPost
                      post={post}
                      currentUserId={currentUserId}
                      liked={feed.likedPosts.has(post.id)}
                      saved
                      isOwner={isOwner}
                      onLike={() => feed.toggleLike(post.id)}
                      onSave={() => sourceFeed.toggleSave(post.id)}
                      onComment={(body) => feed.addComment(post.id, body)}
                      onEdit={() => feed.editPost(post.id)}
                      onDelete={() => feed.deletePost(post.id)}
                      onHide={() => feed.hidePost(post.id)}
                      onReport={() => feed.reportPost(post.id)}
                      onViewActivity={() => feed.viewActivity(post.id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
