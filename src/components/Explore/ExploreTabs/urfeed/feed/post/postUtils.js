import { haptics, sounds } from "../../../../../../Backend/services/feedbackService";
import { decorateShareUrl } from "../../../../../../Backend/services/visibilityCreditService";
import { buildPostShareUrl } from "../../../../../../Backend/services/profileShareService";
import { getExplorePostTargetTab } from "../../../../../../Backend/services/explore/notificationTargetService";

// The public link to this exact post (kunthai.app, also from inside the app,
// whose own address is the device's). Swips say so, so the link opens Swip.
export function getPostUrl(postId, { swip = false } = {}) {
  return buildPostShareUrl(postId, { swip });
}

function isSwipPost(post) {
  return getExplorePostTargetTab(post) === "Swip";
}

export async function copyPostLink(postId, { swip = false } = {}) {
  const postUrl = await decorateShareUrl(getPostUrl(postId, { swip }));

  try {
    await navigator.clipboard.writeText(postUrl);
    return "Link copied";
  } catch {
    return postUrl;
  }
}

export async function sharePost(post) {
  const postUrl = await decorateShareUrl(getPostUrl(post.id, { swip: isSwipPost(post) }));
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

  const result = await copyPostLink(post.id, { swip: isSwipPost(post) });
  haptics.medium("explore");
  sounds.share("explore");
  return result;
}
