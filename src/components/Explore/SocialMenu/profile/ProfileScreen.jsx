import { useEffect, useRef, useState } from "react";
import {
  HiOutlineAtSymbol,
  HiOutlineCalendarDays,
  HiOutlineCheckBadge,
  HiOutlineEnvelope,
  HiOutlinePencilSquare,
  HiOutlinePhone,
  HiOutlinePhoto,
  HiOutlineUserCircle,
} from "react-icons/hi2";

import { updateExploreProfile } from "../../../../Backend/services/exploreService";
import { useExploreFeed } from "../../../../Backend/hooks/useExploreFeed";
import Avatar from "../../shared/Avatar";
import EmptyState from "../../shared/EmptyState";
import FeedPost from "../../ExploreTabs/urfeed/feed/components/FeedPost";
import VideoCard from "../../ExploreTabs/swip/videos/VideoCard";
import SocialScreenHeader from "../shared/SocialScreenHeader";

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
        <Icon className="text-lg" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-800">{value || "Not added yet"}</p>
      </div>
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

export default function ProfileScreen({ profile, hideHeader = false, editable = false, onProfileUpdate }) {
  const [editing, setEditing] = useState(false);
  const [postTab, setPostTab] = useState("feed");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [values, setValues] = useState(profile);
  const fileInputRef = useRef(null);
  const feed = useExploreFeed("feed");
  const swipFeed = useExploreFeed("swip");
  const profileFeedPosts = feed.posts.filter((post) => post.user_id === values?.userId);
  const profileSwipPosts = swipFeed.posts.filter((post) => post.user_id === values?.userId && post.video_url);

  useEffect(() => {
    setValues(profile);
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
    } catch (error) {
      setFeedback(error.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader
          title="Profile"
          subtitle="Your public social identity across Explore, posts, comments, and connections."
        />
      ) : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex flex-none flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => editable && editing && fileInputRef.current?.click()}
                  className="flex-none"
                  aria-label={editable && editing ? "Change profile image" : "Profile image"}
                >
                  <Avatar name={values.displayName} src={values.avatarUrl} size="lg" />
                </button>
                {editable && editing ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    <HiOutlinePhoto />
                    Photo
                  </button>
                ) : null}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              <div className="min-w-0">
                {editing ? (
                  <div className="space-y-2">
                    <input
                      value={values.displayName || ""}
                      onChange={(event) => updateField("displayName", event.target.value)}
                      className="w-full rounded-xl bg-slate-50 px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-sky-500/20"
                      placeholder="Display name"
                    />
                    <input
                      value={values.username || ""}
                      onChange={(event) => updateField("username", event.target.value)}
                      className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                      placeholder="username"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate text-xl font-semibold text-slate-950">{values.displayName}</h3>
                      {values.verified ? <HiOutlineCheckBadge className="flex-none text-lg text-sky-600" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{values.username ? `@${values.username}` : "@username"}</p>
                    {values.bio ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{values.bio}</p> : null}
                  </>
                )}
              </div>
            </div>

            {editable ? (
              <button
                type="button"
                onClick={() => (editing ? saveProfile() : setEditing(true))}
                disabled={saving}
                className="inline-flex flex-none items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <HiOutlinePencilSquare />
                {editing ? (saving ? "Saving" : "Save") : "Edit"}
              </button>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <textarea
                value={values.bio || ""}
                onChange={(event) => updateField("bio", event.target.value)}
                className="min-h-24 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 sm:col-span-2"
                placeholder="Bio"
              />
              <input
                value={values.email || ""}
                onChange={(event) => updateField("email", event.target.value)}
                className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                placeholder="Email"
              />
              <input
                value={values.phone || ""}
                onChange={(event) => updateField("phone", event.target.value)}
                className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                placeholder="Phone"
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              {values.accountType || "personal"}
            </p>
            {values.verified ? (
              <p className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                <HiOutlineCheckBadge />
                Verified
              </p>
            ) : null}
            {feedback ? <p className="text-xs font-medium text-sky-700">{feedback}</p> : null}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <DetailRow icon={HiOutlineUserCircle} label="Full name" value={values.displayName} />
          <DetailRow icon={HiOutlineAtSymbol} label="Username" value={values.username ? `@${values.username}` : ""} />
          <DetailRow icon={HiOutlineEnvelope} label="Email" value={values.email} />
          <DetailRow icon={HiOutlinePhone} label="Phone" value={values.phone} />
          <DetailRow icon={HiOutlineCalendarDays} label="Date of birth" value={values.dateOfBirth} />
          <DetailRow icon={HiOutlineUserCircle} label="Bio" value={values.bio} />
        </section>

        <section className="space-y-4">
          <div className="flex rounded-2xl bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setPostTab("feed")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                postTab === "feed" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Feed
            </button>
            <button
              type="button"
              onClick={() => setPostTab("swip")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                postTab === "swip" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Swip
            </button>
          </div>

          {postTab === "feed" ? (
            profileFeedPosts.length ? (
              <div className="space-y-4">
                {profileFeedPosts.map((post) => (
                  <FeedPost
                    key={post.id}
                    post={post}
                    isOwner={editable}
                    liked={feed.likedPosts.has(post.id)}
                    saved={feed.savedPosts.has(post.id)}
                    onLike={() => feed.toggleLike(post.id)}
                    onSave={() => feed.toggleSave(post.id)}
                    onComment={() => feed.addComment(post.id)}
                    onEdit={() => feed.editPost(post.id)}
                    onDelete={() => feed.deletePost(post.id)}
                    onViewActivity={() => feed.viewActivity(post.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No feed posts yet" message="Feed posts from this account will appear here." />
            )
          ) : profileSwipPosts.length ? (
            <div className="space-y-4">
              {profileSwipPosts.map((post) => (
                <VideoCard
                  key={post.id}
                  post={post}
                  isOwner={editable}
                  liked={swipFeed.likedPosts.has(post.id)}
                  saved={swipFeed.savedPosts.has(post.id)}
                  onLike={() => swipFeed.toggleLike(post.id)}
                  onSave={() => swipFeed.toggleSave(post.id)}
                  onComment={() => swipFeed.addComment(post.id)}
                  onDelete={() => swipFeed.deletePost(post.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No Swip videos yet" message="Videos from this account will appear here." />
          )}
        </section>
      </div>
    </div>
  );
}
