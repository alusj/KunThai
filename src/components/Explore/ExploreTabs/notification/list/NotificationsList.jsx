import NotificationItem from "../components/NotificationItem";

function getActorIdentity(item = {}) {
  const type = item.actor_type === "space" || item.actor_space_id ? "space" : "profile";
  const id = type === "space" ? item.actor_space_id || item.actor_id : item.actor_user_id || item.actor_id;
  return {
    id: id || "",
    key: id ? `${type}:${id}` : "",
  };
}

function groupNotifications(data) {
  const groups = new Map();

  data.forEach((item) => {
    const canGroup = ["like", "reaction", "share", "save"].includes(item.type);
    const key = canGroup ? item.group_key || `${item.type}:${item.post_id || item.media_type || "account"}` : item.id;
    const current = groups.get(key);

    if (!current) {
      groups.set(key, { ...item, groupedItems: [item], groupedCount: 1 });
      return;
    }

    const actorSeen = current.groupedItems.some((grouped) => grouped.actor_user_id && grouped.actor_user_id === item.actor_user_id);
    const groupedItems = actorSeen ? current.groupedItems : [...current.groupedItems, item];
    groups.set(key, {
      ...current,
      groupedItems,
      groupedCount: current.groupedCount + 1,
      read: current.read && item.read,
      created_at: new Date(current.created_at || 0) > new Date(item.created_at || 0) ? current.created_at : item.created_at,
      time_label: new Date(current.created_at || 0) > new Date(item.created_at || 0) ? current.time_label : item.time_label,
    });
  });

  return Array.from(groups.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export default function NotificationsList({ data, followedUsers, onFollowBack, onOpen }) {
  const groupedData = groupNotifications(data);

  return (
    <div className="w-full space-y-3">
      {groupedData.map((item) => (
        <NotificationItem
          key={item.id}
          followed={(() => {
            const actor = getActorIdentity(item);
            return Boolean(actor.id && (followedUsers?.has(actor.key) || followedUsers?.has(actor.id)));
          })()}
          item={item}
          onFollowBack={onFollowBack}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
