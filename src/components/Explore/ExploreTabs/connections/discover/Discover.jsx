import { useExploreConnections } from "../../../../../Backend/hooks/useExploreConnections";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import ConnectionsSkeleton from "../skeletons/ConnectionsSkeleton";
import DiscoverList from "./DiscoverList";

export default function Discover({ currentUserId, onViewProfile }) {
  const { items, loading, error, blockUser, followUser, removeUser, reload } = useExploreConnections("discover", currentUserId);

  if (loading) {
    return <ConnectionsSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!items.length) {
    return <EmptyState title="No suggestions yet" message="Explore will suggest people and brands for you here." />;
  }

  return (
    <DiscoverList
      users={items}
      onBlock={blockUser}
      onFollow={followUser}
      onRemove={removeUser}
      onViewProfile={onViewProfile}
    />
  );
}
