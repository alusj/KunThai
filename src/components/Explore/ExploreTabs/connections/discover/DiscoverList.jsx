import ConnectionCard from "../components/ConnectionCard";

export default function DiscoverList({ mode = "discover", onBlock, onFollow, onRemove, onViewProfile, users }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {users.map((user) => (
        <ConnectionCard
          key={user.id}
          user={user}
          mode={mode}
          onBlock={() => onBlock?.(user)}
          onFollow={() => onFollow?.(user)}
          onRemove={() => onRemove?.(user)}
          onViewProfile={() =>
            onViewProfile?.({
              userId: user.user_id || "",
              ownerUserId: user.owner_user_id || user.user_id || "",
              identityType: user.identity_type || (user.space_id ? "space" : "profile"),
              identityId: user.identity_id || user.space_id || user.user_id || "",
              actorType: user.identity_type || (user.space_id ? "space" : "profile"),
              actorId: user.identity_id || user.space_id || user.user_id || "",
              spaceId: user.space_id || "",
              displayName: user.name || "Profile",
              username: user.username || "",
              avatarUrl: user.avatar_url || "",
              accountType: user.account_type || (user.space_id ? "space" : "personal"),
              categoryLabel: user.category_label || "",
            })
          }
        />
      ))}
    </div>
  );
}
