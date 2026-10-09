import { decorateShareUrl } from "../../../../Backend/services/visibilityCreditService";
import { SPACE_IDENTITY_TYPE, getProfileIdentity } from "../../../../Backend/services/explore/identityService";

export async function buildProfileUrl(values = {}) {
  const url = new URL(window.location.href);
  const identity = getProfileIdentity(values);
  url.hash = identity.type === SPACE_IDENTITY_TYPE
    ? `space-${values.spaceId || values.username || identity.id || "space"}`
    : `profile-${values.userId || values.username || "user"}`;
  const shareUrl = await decorateShareUrl(url.toString());
  return shareUrl;
}

// Opens the system share sheet; without one, copies the link instead.
// Resolves to "shared", "copied" or "cancelled".
export async function shareProfileLink(values, t) {
  const url = await buildProfileUrl(values);
  const data = {
    title: t("profile.shareTitle", { name: values.displayName || t("feed.profileFallback") }),
    text: values.bio || t("profile.shareText", { username: values.username || t("post.userFallback") }),
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  await copyText(url);
  return "copied";
}

export async function copyProfileLink(values) {
  await copyText(await buildProfileUrl(values));
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
  await navigator.clipboard.writeText(text);
}
