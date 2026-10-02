import supabase from "../../lib/supabaseClient";
import { normalizeSpaceActivityRow } from "./spaceActivityModel";

export { describeSpaceActivity, normalizeSpaceActivityRow } from "./spaceActivityModel";

// Activity on the Spaces a person runs, for the badge next to each Space in the
// account switcher: likes, comments, shares and new connections on the Space's
// posts since the person last opened that Space, plus Space inbox messages no
// one on the team has read yet.
//
// "Last opened" is kept on this device per account (a Space visit is a
// device-local reading position, like a scroll offset). Unread messages are
// server truth: they clear for the whole team once someone reads them.

const SEEN_KEY_PREFIX = "kunthai.explore.spaceActivitySeen.";
export const SPACE_ACTIVITY_SEEN_EVENT = "explore-space-activity-seen";

function seenKey(userId) {
  return `${SEEN_KEY_PREFIX}${userId}`;
}

export function readSpaceActivitySeen(userId) {
  if (!userId) return {};
  try {
    const value = JSON.parse(localStorage.getItem(seenKey(userId)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** Opening (or leaving) a Space counts its activity until now as seen. */
export function markSpaceActivitySeen(userId, spaceId) {
  if (!userId || !spaceId) return;
  const seen = { ...readSpaceActivitySeen(userId), [spaceId]: new Date().toISOString() };
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    // Storage is optional: the badge simply keeps counting until it works.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SPACE_ACTIVITY_SEEN_EVENT, { detail: { userId, spaceId } }));
  }
}

/** { [spaceId]: activity } for every Space the signed-in person is on. */
export async function fetchSpaceActivity(userId) {
  if (!userId) return {};
  const { data, error } = await supabase.rpc("get_my_explore_space_activity", { seen: readSpaceActivitySeen(userId) });
  // Before the Space activity migration is live there is simply no badge.
  if (error) return {};
  return (data || []).reduce((map, row) => {
    const activity = normalizeSpaceActivityRow(row);
    if (activity.spaceId) map[activity.spaceId] = activity;
    return map;
  }, {});
}

let channelSequence = 0;

/** Calls onChange when new notifications or messages may change the counts. */
export function subscribeSpaceActivity(userId, onChange) {
  if (!userId) return () => {};
  channelSequence += 1;
  const channel = supabase
    .channel(`explore-space-activity-${userId}-${channelSequence}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "explore_notifications", filter: `user_id=eq.${userId}` }, onChange)
    // Space inbox messages: realtime only delivers rows this person may read.
    .on("postgres_changes", { event: "*", schema: "public", table: "explore_messages" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
