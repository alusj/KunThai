import { useEffect, useRef, useState } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useExploreFollows } from "../../../../Backend/hooks/useExploreFollows";
import { useExploreFollowStats } from "../../../../Backend/hooks/useExploreFollowStats";
import { useTrustSafety } from "../../../../Backend/hooks/useTrustSafety";
import { updateExploreProfile } from "../../../../Backend/services/exploreService";
import { reportExploreProfile } from "../../../../Backend/services/explore/safetyService";
import { showToast } from "../../../../Backend/services/toastService";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import EmptyState from "../../shared/EmptyState";
import ActivityScreen from "../activity/ActivityScreen";
import SavedPostsScreen from "../savedPosts/SavedPostsScreen";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import ProfileEditForm from "./ProfileEditForm";
import ProfileHeaderCard from "./ProfileHeaderCard";
import ProfileTabs from "./ProfileTabs";

const PROFILE_TAB_ORDER = ["feed", "swip", "saved", "activity"];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

function shareProfile(values) {
  const url = new URL(window.location.href);
  url.hash = `profile-${values.userId || values.username || "user"}`;
  const data = {
    title: `${values.displayName || "Profile"} on KunThai`,
    text: values.bio || `View @${values.username || "user"} on KunThai Explore`,
    url: url.toString(),
  };

  if (navigator.share) {
    return navigator.share(data);
  }

  return navigator.clipboard?.writeText(data.url);
}

export default function ProfileScreen({
  currentUserId = "",
  editable = false,
  authProfile = null,
  hideHeader = false,
  loading = false,
  loadError = "",
  onEditProfile,
  onOpenNotification,
  onProfileUpdate,
  onStartChat,
  profile,
  profileFetched = true,
}) {
  const [editing, setEditing] = useState(false);
  const [postTab, setPostTab] = useState("feed");
  const [tabSlideDirection, setTabSlideDirection] = useState("forward");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [values, setValues] = useState(profile || {});
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const feed = useExploreFeed("feed");
  const swipFeed = useExploreFeed("swip");
  const followStats = useExploreFollowStats(values?.userId);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);
  const safety = useTrustSafety();
  const profileFeedPosts = feed.posts.filter((post) => post.user_id === values?.userId);
  const profileSwipPosts = swipFeed.posts.filter((post) => post.user_id === values?.userId && post.video_url);
  const displayedStats = {
    ...(followStats.stats || {}),
    feed: profileFeedPosts.length,
    swip: profileSwipPosts.length,
  };
  const followed = Boolean(values?.userId && followedUsers.has(values.userId));

  useEffect(() => {
    setValues(profile || {});
  }, [profile]);

  useEffect(() => {
    if (postTab === "swip" && values?.userId && !swipFeed.loading) {
      swipFeed.reload();
    }
    // swipFeed is a hook facade; tab/user changes are the intended refresh triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postTab, values?.userId]);

  function updateField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setFeedback("");
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      updateField("avatarUrl", await fileToDataUrl(file));
    } catch (error) {
      setFeedback(error.message || "Unable to load image.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      updateField("coverUrl", await fileToDataUrl(file));
    } catch (error) {
      setFeedback(error.message || "Unable to load cover image.");
    } finally {
      event.target.value = "";
    }
  }

  async function saveProfile() {
    try {
      setSaving(true);
      const updated = await updateExploreProfile({
        ...authProfile,
        ...values,
        userId: currentUserId || values.userId || authProfile?.userId || "",
      });
      setValues(updated);
      onProfileUpdate?.(updated);
      setEditing(false);
      setFeedback(updated.avatarWarning || "Profile updated.");
      showToast("Profile updated.", "success");
    } catch (error) {
      setFeedback(error.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function followProfile() {
    await toggleFollow(values.userId);
  }

  function changeProfileTab(nextTab) {
    if (nextTab === postTab) return;

    const currentIndex = PROFILE_TAB_ORDER.indexOf(postTab);
    const nextIndex = PROFILE_TAB_ORDER.indexOf(nextTab);
    setTabSlideDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setPostTab(nextTab);
  }

  async function handleShare() {
    try {
      await shareProfile(values);
      setFeedback("Profile link ready.");
      showToast("Profile link ready.", "success");
    } catch {
      setFeedback("Unable to share profile.");
    }
  }

  function blockProfile() {
    safety.blockUser(values.userId, "blocked from profile");
    setFeedback("Profile blocked.");
  }

  async function reportProfile() {
    try {
      const result = await reportExploreProfile(values.userId);
      const message = result.alreadyReported ? "You already reported this profile." : "Profile report sent for review.";
      setFeedback(message);
      showToast(message, "success");
    } catch (error) {
      const message = error.message || "Unable to send this profile report.";
      setFeedback(message);
      showToast(message, "danger");
    }
  }

  function renderFeedPosts() {
    if (!profileFeedPosts.length) {
      return <EmptyState title="No feed posts yet" message="Feed posts from this account will appear here." />;
    }

    return profileFeedPosts.map((post) => (
      <FeedPost
        key={post.id}
        post={post}
        currentUserId={currentUserId}
        isOwner={editable}
        liked={feed.likedPosts.has(post.id)}
        saved={feed.savedPosts.has(post.id)}
        onLike={() => feed.toggleLike(post.id)}
        onSave={() => feed.toggleSave(post.id)}
        onComment={(body) => feed.addComment(post.id, body)}
        onEdit={(body) => feed.editPost(post.id, body)}
        onDelete={() => feed.deletePost(post.id, { confirm: false })}
        onViewActivity={() => feed.viewActivity(post.id)}
      />
    ));
  }

  function renderSwipPosts() {
    if (!profileSwipPosts.length) {
      return <EmptyState title="No Swip videos yet" message="Videos from this account will appear here." />;
    }

    return profileSwipPosts.map((post) => (
      <div key={post.id} className="h-[520px] overflow-hidden rounded-[28px] bg-slate-950 sm:h-[640px]">
        <VideoCard
          post={post}
          active={postTab === "swip"}
          currentUserId={currentUserId}
          isOwner={editable}
          liked={swipFeed.likedPosts.has(post.id)}
          saved={swipFeed.savedPosts.has(post.id)}
          onLike={() => swipFeed.toggleLike(post.id)}
          onSave={() => swipFeed.toggleSave(post.id)}
          onComment={(body) => swipFeed.addComment(post.id, body)}
          onDelete={() => swipFeed.deletePost(post.id, { confirm: false })}
        />
      </div>
    ));
  }

  function renderTabContent() {
    if (postTab === "feed") return renderFeedPosts();
    if (postTab === "swip") return renderSwipPosts();
    if (postTab === "saved" && editable) return <SavedPostsScreen currentUserId={currentUserId} hideHeader />;
    if (postTab === "activity" && editable) return <ActivityScreen hideHeader onOpenNotification={onOpenNotification} />;
    return null;
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader
          title="Profile"
          subtitle="Public profile, posts, Swip videos, saved posts, and account activity."
        />
      ) : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
        {loading ? (
          <ProfileSkeleton />
        ) : loadError ? (
          <EmptyState title="Profile could not load" message={loadError} />
        ) : profileFetched && !profile ? (
          <CreateProfileState
            onCreate={() => {
              setValues({ ...(authProfile || {}), userId: currentUserId || authProfile?.userId || "" });
              setEditing(true);
            }}
          />
        ) : null}

        {!loading && !loadError && (profile || editing) ? (
          <>
        <ProfileHeaderCard
          editable={editable}
          editing={editing}
          coverInputRef={coverInputRef}
          feedback={feedback}
          fileInputRef={fileInputRef}
          followed={followed}
          onAvatarChange={handleAvatarChange}
          onBlock={blockProfile}
          onCoverChange={handleCoverChange}
          onCoverPreset={(preset) => updateField("coverUrl", `preset:${preset}`)}
          onEdit={() => {
            if (!editing && onEditProfile) {
              onEditProfile();
              return;
            }

            editing ? saveProfile() : setEditing(true);
          }}
          onFollow={followProfile}
          onMessage={() => onStartChat?.(values)}
          onReport={reportProfile}
          onShare={handleShare}
          saving={saving}
          loadingStats={followStats.loading && !followStats.stats}
          stats={displayedStats}
          values={values}
        />

        {editing ? <ProfileEditForm values={values} onChange={updateField} /> : null}

        <ProfileTabs active={postTab} editable={editable} onChange={changeProfileTab} />

        <section
          key={postTab}
          className={`w-full space-y-4 ${tabSlideDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"}`}
        >
          {renderTabContent()}
        </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="h-28 animate-pulse rounded-t-[28px] bg-slate-100 sm:h-36" />
      <div className="-mt-10 px-5 pb-5">
        <div className="h-16 w-16 animate-pulse rounded-full bg-slate-200 ring-4 ring-white" />
        <div className="mt-4 space-y-2">
          <div className="h-6 w-48 animate-pulse rounded-full bg-slate-200" />
          <div className="h-4 w-28 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-full max-w-md animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-2xl bg-slate-50" />
          ))}
        </div>
      </div>
    </section>
  );
}

function CreateProfileState({ onCreate }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
      <h3 className="text-base font-black text-slate-950">Create your profile</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
        Your public Explore profile has not been created yet. Add real profile details before your posts and reactions go live.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
      >
        Create profile
      </button>
    </div>
  );
}
