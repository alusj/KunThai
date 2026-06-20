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
    audioUrl: post.audio_url || "",
    audioDurationSeconds: post.audio_duration_seconds || null,
    createdAt: post.created_at || null,
  };
}

export async function createExploreRepost(sourcePost, { commentary = "", privacy = "public" } = {}) {
  if (!sourcePost?.id) throw new Error("This post is not available for reposting.");

  const body = String(commentary || "").trim();
  const created = await createExplorePost({
    body,
    post_privacy: privacy,
    post_type: "repost",
    category: "urfeed",
    hashtags: parseTokens(body, "#"),
    mentions: parseTokens(body, "@"),
    media_meta: {
      repost: buildExploreRepostSnapshot(sourcePost),
    },
  }, "feed");

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
