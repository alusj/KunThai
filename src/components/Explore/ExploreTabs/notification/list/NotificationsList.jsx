import NotificationItem from "../components/NotificationItem";

export default function NotificationsList({ data, followedUsers, onFollowBack, onOpen }) {
  return (
    <div className="w-full space-y-3">
      {data.map((item) => (
        <NotificationItem key={item.id} followed={Boolean(item.actor_user_id && followedUsers?.has(item.actor_user_id))} item={item} onFollowBack={onFollowBack} onOpen={onOpen} />
      ))}
    </div>
  );
}
