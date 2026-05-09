import ConnectionCard from "../components/ConnectionCard";

export default function DiscoverList({ mode = "discover", onBlock, onFollow, onRemove, onViewProfile, users }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {users.map((user) => (
        <ConnectionCard
          key={user.id}
          user={user}
          mode={mode}
          onBlock={() => onBlock?.(user.user_id)}
          onFollow={() => onFollow?.(user.user_id)}
          onRemove={() => onRemove?.(user.user_id)}
          onViewProfile={() =>
            onViewProfile?.({
              userId: user.user_id || "",
              displayName: user.name || "Profile",
              username: user.username || "",
              avatarUrl: user.avatar_url || "",
              accountType: user.account_type || "personal",
            })
          }
        />
      ))}
    </div>
  );
}
