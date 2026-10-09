// Activity for the identity being used: acting as a Space, only the
// notifications tagged for that Space (recipient_space_id); otherwise all.
export function filterActivityForIdentity(notifications = [], spaceId = "") {
  if (!spaceId) return notifications;
  return notifications.filter((item) => (item.recipient_space_id || item.recipientSpaceId || "") === spaceId);
}
