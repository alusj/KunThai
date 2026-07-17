import { createExploreNotification } from "../exploreService";
import { createExplorePost } from "./postService";

function parseTokens(value = "", prefix) {
  const pattern = prefix === "#" ? /#[a-z0-9_]+/gi : /@[a-z0-9_]+/gi;
  return Array.from(new Set((String(value).match(pattern) || []).map((token) => token.slice(1).toLowerCase())));
}

export function buildExploreRepostSnapshot(post = {}) {
  const existing = post.media_meta?.repost || post.mediaMeta?.repost;
  if (existing?.sourcePostId) return { ...existing };

  return {
    sourcePostId: post.id || "",
    sourceType: post.video_url ? "swip" : "post",
    authorUserId: post.user_id || "",
    authorName: post.author_name || "Profile",
    authorUsername: post.author_username || "",
    authorAvatarUrl: post.author_avatar_url || "",
    body: post.body || "",
    imageUrl: post.image_url || "",
    videoUrl: post.video_url || "",
    videoTrimStart: post.video_trim_start ?? post.videoTrimStart ?? post.media_meta?.videoTrimStart ?? post.mediaMeta?.videoTrimStart ?? 0,
    videoTrimEnd: post.video_trim_end ?? post.videoTrimEnd ?? post.media_meta?.videoTrimEnd ?? post.mediaMeta?.videoTrimEnd ?? null,
    audioUrl: post.audio_url || "",
    audioDurationSeconds: post.audio_duration_seconds || null,
    createdAt: post.created_at || null,
  };
}

export async function createExploreRepost(sourcePost, { commentary = "", privacy = "public" } = {}) {
  if (!sourcePost?.id) throw new Error("This post is not available for reposting.");

  const body = String(commentary || "").trim();
  const snapshot = buildExploreRepostSnapshot(sourcePost);
  // A shared Swip stays on the Swip surface; a shared feed post stays in UrFeed.
  const isSwipShare = snapshot.sourceType === "swip";
  const created = await createExplorePost({
    body,
    post_privacy: privacy,
    post_type: "repost",
    category: isSwipShare ? "swip" : "urfeed",
    hashtags: parseTokens(body, "#"),
    mentions: parseTokens(body, "@"),
    media_meta: {
      repost: snapshot,
    },
  }, isSwipShare ? "swip" : "feed");

  if (sourcePost.user_id && sourcePost.user_id !== created.user_id) {
    await createExploreNotification({
      user_id: sourcePost.user_id,
      type: "repost",
      post_id: sourcePost.id,
      post_preview: body || sourcePost.body || "Your post was reposted",
      media_type: sourcePost.video_url ? "Swip video" : "post",
    }).catch(() => null);
  }

  return created;
}
