import { useExploreConnections } from "../../../../../Backend/hooks/useExploreConnections";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import ConnectionsSkeleton from "../skeletons/ConnectionsSkeleton";
import MyCircleList from "./MyCircleList";

export default function MyCircle({ currentUserId, kind = "mycircle", onViewProfile }) {
  const { items, loading, error, blockUser, followUser, removeUser, reload } = useExploreConnections(kind, currentUserId);

  if (loading) {
    return <ConnectionsSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!items.length) {
    return (
      <EmptyState
        title={kind === "followers" ? "No followers yet" : "No connections yet"}
        message={kind === "followers" ? "People who follow you will appear here." : "People you follow will appear in your circle."}
      />
    );
  }

  return (
    <MyCircleList
      users={items}
      onBlock={blockUser}
      onFollow={followUser}
      onRemove={removeUser}
      onViewProfile={onViewProfile}
    />
  );
}
