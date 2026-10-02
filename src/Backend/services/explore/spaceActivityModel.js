// Pure helpers for Space activity badges (no network), shared by the service,
// the badge component and tests.

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

export function normalizeSpaceActivityRow(row = {}) {
  const activity = {
    spaceId: row.space_id || row.spaceId || "",
    reactions: toCount(row.reactions),
    comments: toCount(row.comments),
    shares: toCount(row.shares),
    follows: toCount(row.follows),
    other: toCount(row.other_activity ?? row.other),
    messages: toCount(row.unread_messages ?? row.messages),
    latestAt: row.latest_at || row.latestAt || "",
  };
  activity.total = activity.reactions + activity.comments + activity.shares + activity.follows + activity.other + activity.messages;
  return activity;
}

/** Short summary for a badge's accessible label / tooltip, in English source text. */
export function describeSpaceActivity(activity, translate = (text) => text) {
  if (!activity?.total) return "";
  const parts = [
    [activity.messages, "{value0} new messages", "1 new message"],
    [activity.comments, "{value0} comments", "1 comment"],
    [activity.reactions, "{value0} likes", "1 like"],
    [activity.shares, "{value0} shares", "1 share"],
    [activity.follows, "{value0} new connections", "1 new connection"],
    [activity.other, "{value0} other updates", "1 other update"],
  ];
  return parts
    .filter(([count]) => count > 0)
    .map(([count, many, one]) => (count === 1 ? translate(one) : translate(many, { value0: count })))
    .join(" · ");
}
