import { useMemo, useState } from "react";
import { HiOutlineFolderPlus } from "react-icons/hi2";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useSavedPosts } from "../../../../Backend/hooks/useProfilePosts";
import { useSavedCollections } from "../../../../Backend/hooks/useSavedCollections";
import { readActiveExploreIdentity } from "../../../../Backend/services/explore/spaceService";
import { SPACE_IDENTITY_TYPE } from "../../../../Backend/services/explore/identityService";
import { useI18n } from "../../../../i18n";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import { LoadMoreButton, PostListStatus } from "../profile/ProfilePostList";
import { buildListActions } from "../profile/profileListActions";
import CollectionPicker from "./CollectionPicker";
import CollectionManager from "./CollectionManager";
import SavedFilters from "./SavedFilters";
import SavedToolbar from "./SavedToolbar";

function searchableText(post) {
  return [post.body, post.author_name, post.author_username, ...(post.hashtags || [])].filter(Boolean).join(" ").toLowerCase();
}

// Saved posts come from the account's saves on the server (newest first,
// page by page), so older saves show even when the home feed never loaded them.
export default function SavedPostsScreen({ currentUserId, hideHeader = false }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [managerOpen, setManagerOpen] = useState(false);
  const [pickerPostId, setPickerPostId] = useState("");
  const reactions = useExploreFeed("feed");
  const list = useSavedPosts(currentUserId);
  const collections = useSavedCollections(currentUserId);
  const actions = buildListActions(list, reactions);
  const actingAsSpace = readActiveExploreIdentity()?.type === SPACE_IDENTITY_TYPE;

  const visibleItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    const activeCollection = collections.collections.find((collection) => collection.id === filter);
    return list.posts.filter((post) => {
      if (filter === "feed" && post.savedType !== "feed") return false;
      if (filter === "swip" && post.savedType !== "swip") return false;
      if (activeCollection && !activeCollection.postIds?.includes(post.id)) return false;
      if (value && !searchableText(post).includes(value)) return false;
      return true;
    });
  }, [collections.collections, filter, list.posts, query]);

  function unsave(postId) {
    actions.toggleSave(postId);
    list.removePost(postId);
  }

  const savedCount = Number.isFinite(list.total) ? list.total : list.posts.length;

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={t("screens.SavedPostsTitle")} subtitle={t("screens.SavedPostsSubtitle")} /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        {actingAsSpace ? (
          <p className="rounded-[20px] bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">{t("exploreProfileFix.savedPersonalNote")}</p>
        ) : null}

        <SavedToolbar query={query} onCreateCollection={() => setManagerOpen(true)} onQueryChange={setQuery} />
        <SavedFilters active={filter} collections={collections.collections} onChange={setFilter} />

        {!list.loading || list.posts.length ? (
          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
            {t("explore.savedItemsCount", { count: savedCount })}
          </div>
        ) : null}

        <PostListStatus
          list={list}
          emptyTitle={t("explore.noSavedItems")}
          emptyMessage={t("explore.noSavedItemsMsg")}
          errorMessage={t("exploreProfileFix.savedLoadFailed")}
        />

        {list.posts.length && !visibleItems.length ? (
          <p className="py-8 text-center text-sm font-bold text-slate-400">{t("explore.noSavedItems")}</p>
        ) : null}

        {visibleItems.length ? (
          <div className="space-y-4">
            {visibleItems.map((post) => {
              const isOwner = Boolean(currentUserId && post.user_id === currentUserId);
              return (
                <div key={post.id} className="space-y-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setPickerPostId((current) => (current === post.id ? "" : post.id))}
                      aria-expanded={pickerPostId === post.id}
                      className="inline-flex h-9 items-center gap-2 rounded-2xl bg-white px-3 text-xs font-black text-slate-600 shadow-sm"
                    >
                      <HiOutlineFolderPlus className="text-base" />
                      {t("exploreProfileFix.addToCollection")}
                    </button>
                  </div>
                  {pickerPostId === post.id ? (
                    <CollectionPicker
                      collections={collections.collections}
                      postId={post.id}
                      onToggle={collections.toggleItem}
                      onManage={() => setManagerOpen(true)}
                    />
                  ) : null}

                  {post.savedType === "swip" ? (
                    <VideoCard
                      post={post}
                      currentUserId={currentUserId}
                      liked={actions.likedPosts.has(post.id)}
                      saved
                      isOwner={isOwner}
                      onLike={() => actions.toggleLike(post.id)}
                      onSave={() => unsave(post.id)}
                      onComment={(delta) => actions.bumpCommentCount(post.id, typeof delta === "number" ? delta : 1)}
                      onDelete={() => actions.deletePost(post.id)}
                    />
                  ) : (
                    <FeedPost
                      post={post}
                      currentUserId={currentUserId}
                      liked={actions.likedPosts.has(post.id)}
                      saved
                      isOwner={isOwner}
                      onLike={() => actions.toggleLike(post.id)}
                      onSave={() => unsave(post.id)}
                      onCommentCountChange={(delta) => actions.bumpCommentCount(post.id, delta)}
                      onEdit={(body) => actions.editPost(post.id, body)}
                      onDelete={() => actions.deletePost(post.id)}
                      onHide={() => {
                        reactions.hidePost(post.id);
                        list.removePost(post.id);
                      }}
                      onReport={(reason) => reactions.reportPost(post.id, reason)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <LoadMoreButton list={list} />
      </div>

      {managerOpen ? (
        <CollectionManager
          collections={collections}
          onClose={() => setManagerOpen(false)}
          onDeleted={(collectionId) => {
            if (filter === collectionId) setFilter("all");
          }}
        />
      ) : null}
    </div>
  );
}
