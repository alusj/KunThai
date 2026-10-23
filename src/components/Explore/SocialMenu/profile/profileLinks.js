import { buildDecoratedProfileShareUrl } from "../../../../Backend/services/profileShareService";
import { SPACE_IDENTITY_TYPE, getProfileIdentity } from "../../../../Backend/services/explore/identityService";

// What the Share profile sheet (shared/share/ShareProfileSheet) shows for an
// Explore profile: the same kunthai.app link and QR code as UrMall and UrRide
// profiles, for a person ("person") or a Space ("space").
export function profileShareTarget(values = {}) {
  const identity = getProfileIdentity(values);
  const isSpace = identity.type === SPACE_IDENTITY_TYPE;
  const id = isSpace ? values.spaceId || identity.id : values.userId || identity.id;
  return {
    kind: isSpace ? "space" : "person",
    profileId: id || "",
    name: values.displayName || values.name || "",
    subtitle: values.username ? `@${values.username}` : "",
    avatarUrl: values.avatarUrl || "",
  };
}

export async function copyProfileLink(values) {
  const { kind, profileId } = profileShareTarget(values);
  const url = await buildDecoratedProfileShareUrl(kind, profileId);
  if (!url) throw new Error("No profile to link.");
  await copyText(url);
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
  await navigator.clipboard.writeText(text);
}
