import { useExploreConnections } from "../../../../../Backend/hooks/useExploreConnections";
import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import DiscoverList from "./DiscoverList";

export default function Discover({ currentUserId, onViewProfile }) {
  const { items, loading, error, blockUser, followUser, removeUser, reload } = useExploreConnections("discover", currentUserId);

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (loading && !items.length) {
    return <ConnectionListSkeleton />;
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

function ConnectionListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 animate-pulse rounded-full bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-4 w-44 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
              <div className="h-3 w-full max-w-sm animate-pulse rounded-full bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
