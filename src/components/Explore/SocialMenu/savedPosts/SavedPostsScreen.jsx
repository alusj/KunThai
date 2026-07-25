import { useMemo, useState } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useSavedCollections } from "../../../../Backend/hooks/useSavedCollections";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import ErrorState from "../../shared/ErrorState";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
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

  function createCollection(event) {
    event?.preventDefault?.();
    const name = collectionName.trim();
    if (name) {
      collections.createCollection(name);
      setCollectionName("");
      setCollectionOpen(false);
      showToast(t("explore.collectionCreated"), "success");
    }
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={t("screens.SavedPostsTitle")} subtitle={t("screens.SavedPostsSubtitle")} /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        {feed.error ? <ErrorState message={feed.error} onRetry={feed.reload} /> : null}
        {swip.error ? <ErrorState message={swip.error} onRetry={swip.reload} /> : null}

        <SavedToolbar query={query} onCreateCollection={() => setCollectionOpen(true)} onQueryChange={setQuery} />
        <SavedFilters active={filter} collections={collections.collections} onChange={setFilter} />

        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
          {t("explore.savedItemsCount", { count: savedItems.length })}
        </div>

        {!visibleItems.length ? (
          <EmptyState
            title={t("explore.noSavedItems")}
            message={t("explore.noSavedItemsMsg")}
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
                      onDelete={() => swip.deletePost(post.id, { confirm: false })}
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
                      onEdit={(body) => feed.editPost(post.id, body)}
                      onDelete={() => feed.deletePost(post.id, { confirm: false })}
                      onHide={() => feed.hidePost(post.id)}
                      onReport={(reason) => feed.reportPost(post.id, reason)}
                      onViewActivity={() => feed.viewActivity(post.id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {collectionOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/30 px-4 pb-4 backdrop-blur-sm" onClick={() => setCollectionOpen(false)}>
          <form className="w-full rounded-[24px] bg-white p-4 shadow-2xl sm:mx-auto sm:max-w-md" onSubmit={createCollection} onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{t("explore.newCollection")}</p>
            <input
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              placeholder={t("explore.collectionName")}
              className="mt-3 h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 outline-none"
              autoFocus
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCollectionOpen(false)} className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                {t("explore.cancel")}
              </button>
              <button type="submit" disabled={!collectionName.trim()} className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-50">
                {t("explore.create")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
