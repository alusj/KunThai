import { useEffect, useRef, useState } from "react";

import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import { useExploreFollows } from "../../../../Backend/hooks/useExploreFollows";
import { useExploreFollowStats } from "../../../../Backend/hooks/useExploreFollowStats";
import { useTrustSafety } from "../../../../Backend/hooks/useTrustSafety";
import { updateExploreProfile } from "../../../../Backend/services/exploreService";
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
  hideHeader = false,
  onOpenNotification,
  onProfileUpdate,
  onStartChat,
  profile,
}) {
  const [editing, setEditing] = useState(false);
  const [postTab, setPostTab] = useState("feed");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [values, setValues] = useState(profile || {});
  const fileInputRef = useRef(null);
  const feed = useExploreFeed("feed");
  const swipFeed = useExploreFeed("swip");
  const followStats = useExploreFollowStats(values?.userId);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);
  const safety = useTrustSafety();
  const profileFeedPosts = feed.posts.filter((post) => post.user_id === values?.userId);
  const profileSwipPosts = swipFeed.posts.filter((post) => post.user_id === values?.userId && post.video_url);
  const followed = Boolean(values?.userId && followedUsers.has(values.userId));

  useEffect(() => {
    setValues(profile || {});
  }, [profile]);

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

  async function saveProfile() {
    try {
      setSaving(true);
      const updated = await updateExploreProfile(values);
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

  function reportProfile() {
    setFeedback("Profile report received.");
    showToast("Profile report received.", "success");
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
        onEdit={() => feed.editPost(post.id)}
        onDelete={() => feed.deletePost(post.id)}
        onViewActivity={() => feed.viewActivity(post.id)}
      />
    ));
  }

  function renderSwipPosts() {
    if (!profileSwipPosts.length) {
      return <EmptyState title="No Swip videos yet" message="Videos from this account will appear here." />;
    }

    return profileSwipPosts.map((post) => (
      <VideoCard
        key={post.id}
        post={post}
        currentUserId={currentUserId}
        isOwner={editable}
        liked={swipFeed.likedPosts.has(post.id)}
        saved={swipFeed.savedPosts.has(post.id)}
        onLike={() => swipFeed.toggleLike(post.id)}
        onSave={() => swipFeed.toggleSave(post.id)}
        onComment={(body) => swipFeed.addComment(post.id, body)}
        onDelete={() => swipFeed.deletePost(post.id)}
      />
    ));
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader
          title="Profile"
          subtitle="Public profile, posts, Swip videos, saved posts, and account activity."
        />
      ) : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        <ProfileHeaderCard
          editable={editable}
          editing={editing}
          feedback={feedback}
          fileInputRef={fileInputRef}
          followed={followed}
          onAvatarChange={handleAvatarChange}
          onBlock={blockProfile}
          onEdit={() => (editing ? saveProfile() : setEditing(true))}
          onFollow={followProfile}
          onMessage={() => onStartChat?.(values)}
          onReport={reportProfile}
          onShare={handleShare}
          saving={saving}
          stats={{
            feed: profileFeedPosts.length,
            swip: profileSwipPosts.length,
            followers: followStats.followers,
            following: followStats.following,
          }}
          values={values}
        />

        {editing ? <ProfileEditForm values={values} onChange={updateField} /> : null}

        <ProfileTabs active={postTab} editable={editable} onChange={setPostTab} />

        <section className="space-y-4">
          {postTab === "feed" ? renderFeedPosts() : null}
          {postTab === "swip" ? renderSwipPosts() : null}
          {postTab === "saved" && editable ? <SavedPostsScreen currentUserId={currentUserId} hideHeader /> : null}
          {postTab === "activity" && editable ? <ActivityScreen hideHeader onOpenNotification={onOpenNotification} /> : null}
        </section>
      </div>
    </div>
  );
}
