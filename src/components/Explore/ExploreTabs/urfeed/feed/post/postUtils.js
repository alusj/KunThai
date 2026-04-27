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
    window.prompt("Copy post link", postUrl);
    return "Copy the link above";
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
    return "Shared";
  }

  return copyPostLink(post.id);
}
