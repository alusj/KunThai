import { haptics, sounds } from "../../../../../../Backend/services/feedbackService";

export function getPostUrl(postId) {
  const url = new URL(window.location.href);
  url.hash = `post-${postId}`;
  return url.toString();
}

export async function copyPostLink(postId) {
  const postUrl = getPostUrl(postId);

  try {
    await navigator.clipboard.writeText(postUrl);
    return "Link copied";
  } catch {
    return postUrl;
  }
}

export async function sharePost(post) {
  const postUrl = getPostUrl(post.id);
  const shareData = {
    title: `${post.author_name || "KunThai"}'s post`,
    text: post.body || "View this post on KunThai",
    url: postUrl,
  };

  if (navigator.share) {
    await navigator.share(shareData);
    haptics.medium("explore");
    sounds.share("explore");
    return "Shared";
  }

  const result = await copyPostLink(post.id);
  haptics.medium("explore");
  sounds.share("explore");
  return result;
}
