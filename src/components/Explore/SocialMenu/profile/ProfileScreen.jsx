import { useEffect, useRef, useState } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useExploreFollows } from "../../../../Backend/hooks/useExploreFollows";
import { useExploreFollowStats } from "../../../../Backend/hooks/useExploreFollowStats";
import { useTrustSafety } from "../../../../Backend/hooks/useTrustSafety";
import { useVisibilityCredits } from "../../../../Backend/hooks/useVisibilityCredits";
import {
  SPACE_IDENTITY_TYPE,
  getProfileIdentity,
  postMatchesIdentity,
  respondExploreSpaceInvite,
  updateExploreProfile,
  updateExploreSpace,
} from "../../../../Backend/services/exploreService";
import { blockExploreIdentity, reportExploreProfile, reportExploreSpace } from "../../../../Backend/services/explore/safetyService";
import { showToast } from "../../../../Backend/services/toastService";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import Avatar from "../../shared/Avatar";
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
  const identity = getProfileIdentity(values);
  url.hash = identity.type === SPACE_IDENTITY_TYPE
    ? `space-${values.spaceId || values.username || identity.id || "space"}`
    : `profile-${values.userId || values.username || "user"}`;
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
  onCreateSpace,
  onOpenNotification,
  onProfileUpdate,
  onSpaceInviteResponse,
  onSwitchIdentity,
  onStartChat,
  profile,
  profileFetched = true,
  spaces = [],
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
  const profileIdentity = getProfileIdentity(values);
  const isSpace = profileIdentity.type === SPACE_IDENTITY_TYPE;
  const followStats = useExploreFollowStats(profileIdentity);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);
  const safety = useTrustSafety();
  const profileFeedPosts = feed.posts.filter((post) => postMatchesIdentity(post, profileIdentity));
  const profileSwipPosts = swipFeed.posts.filter((post) => postMatchesIdentity(post, profileIdentity) && post.video_url);
  const credits = useVisibilityCredits({ enabled: editable && !isSpace && Boolean(currentUserId) });
  // Locally loaded posts win once present, but until the feed hooks resolve the
  // remote stat keeps the tile from flashing 0.
  const displayedStats = {
    ...(followStats.stats || {}),
    feed: profileFeedPosts.length || Number(followStats.stats?.feed || 0),
    swip: profileSwipPosts.length || Number(followStats.stats?.swip || 0),
  };
  const followed = Boolean(profileIdentity.key && (followedUsers.has(profileIdentity.key) || followedUsers.has(profileIdentity.id)));
  const accountUnavailable = Boolean(values?.deactivatedAt) && !editable;

  useEffect(() => {
    setValues(profile || {});
  }, [profile]);

  useEffect(() => {
    if (postTab === "swip" && profileIdentity.id && !swipFeed.loading) {
      swipFeed.reload();
    }
    // swipFeed is a hook facade; tab/user changes are the intended refresh triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postTab, profileIdentity.id, profileIdentity.key]);

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
      const updated = isSpace
        ? await updateExploreSpace(values.spaceId || profileIdentity.id, values)
        : await updateExploreProfile({
          ...authProfile,
          ...values,
          userId: currentUserId || values.userId || authProfile?.userId || "",
        });
      setValues(updated);
      onProfileUpdate?.(updated);
      setEditing(false);
      setFeedback(updated.avatarWarning || (isSpace ? "Space updated." : "Profile updated."));
      showToast(isSpace ? "Space updated." : "Profile updated.", "success");
    } catch (error) {
      setFeedback(error.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function followProfile() {
    await toggleFollow(profileIdentity);
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

  async function handleShareCredits() {
    try {
      await credits.shareInvite();
      setFeedback("Invite link ready.");
      showToast("Invite link ready.", "success", { title: "Visibility Credits" });
    } catch (error) {
      const message = error.message || "Unable to share invite link.";
      setFeedback(message);
      showToast(message, "danger");
    }
  }


  async function blockProfile() {
    if (isSpace) {
      try {
        await blockExploreIdentity(profileIdentity, "blocked from Space profile");
        setFeedback("Space blocked.");
        showToast("Space blocked.", "success");
      } catch (error) {
        const message = error.message || "Unable to block this Space.";
        setFeedback(message);
        showToast(message, "danger");
      }
      return;
    }
    safety.blockUser(values.userId, "blocked from profile");
    setFeedback("Profile blocked.");
  }

  async function reportProfile() {
    if (isSpace) {
      try {
        const result = await reportExploreSpace(values.spaceId || profileIdentity.id);
        const message = result.alreadyReported ? "You already reported this Space." : "Space report sent for review.";
        setFeedback(message);
        showToast(message, "success");
      } catch (error) {
        const message = error.message || "Unable to send this Space report.";
        setFeedback(message);
        showToast(message, "danger");
      }
      return;
    }
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

  async function respondToSpaceInvite(space, accept) {
    try {
      const result = await respondExploreSpaceInvite(space, accept);
      onSpaceInviteResponse?.(space, result, accept);
      const message = accept ? "Space invitation accepted." : "Space invitation declined.";
      setFeedback(message);
      showToast(message, "success");
    } catch (error) {
      const message = error.message || "Unable to respond to this Space invitation.";
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
        {loading && !profile ? (
          <p className="py-12 text-center text-sm font-bold text-slate-400">Opening profile...</p>
        ) : loadError ? (
          <EmptyState title="Profile could not load" message={loadError} />
        ) : accountUnavailable ? (
          <EmptyState
            title="Account unavailable"
            message="This account is currently unavailable. It will appear again if the owner reactivates it."
          />
        ) : profileFetched && !profile ? (
          <CreateProfileState
            onCreate={() => {
              setValues({ ...(authProfile || {}), userId: currentUserId || authProfile?.userId || "" });
              setEditing(true);
            }}
          />
        ) : null}

        {!loadError && !accountUnavailable && (profile || editing) ? (
          <>
        {editable && !isSpace && spaces.length ? (
          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Your Spaces</p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 kuntai-scrollbar-none">
              {spaces.map((space) => (
                <div
                  key={space.spaceId}
                  className="flex min-w-[112px] flex-col items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-center"
                >
                  <button type="button" disabled={space.membershipStatus === "pending"} onClick={() => onSwitchIdentity?.(space, { openDashboard: true })} className="kt-pressable flex flex-col items-center gap-2 disabled:cursor-default">
                    <Avatar name={space.displayName} src={space.avatarUrl} size="md" />
                    <span className="line-clamp-2 text-xs font-black leading-4 text-slate-700">{space.displayName}</span>
                  </button>
                  {space.membershipStatus === "pending" ? (
                    <div className="grid w-full grid-cols-2 gap-1">
                      <button type="button" onClick={() => respondToSpaceInvite(space, true)} className="h-8 rounded-xl bg-sky-700 text-[11px] font-black text-white">
                        Accept
                      </button>
                      <button type="button" onClick={() => respondToSpaceInvite(space, false)} className="h-8 rounded-xl bg-white text-[11px] font-black text-slate-600">
                        Decline
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-sky-700">{space.memberRole || "member"}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}
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
          onCreateSpace={editable && !isSpace ? onCreateSpace : undefined}
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
          onShareCredits={handleShareCredits}
          saving={saving}
          creditLoading={credits.loading}
          creditWallet={editable && !isSpace ? credits.wallet : null}
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
