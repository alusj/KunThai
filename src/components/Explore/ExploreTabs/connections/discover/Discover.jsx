import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import DiscoverList from "./DiscoverList";
import ImportContactsPanel from "./ImportContactsPanel";
import { t as i18nText } from "../../../../../i18n/index";

export default function Discover({ connectionState, onViewProfile }) {
  const { items = [], loading = false, error = "", blockUser, followUser, removeUser, reload } = connectionState || {};

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (loading && !items.length) {
    return <ConnectionListSkeleton />;
  }

  if (!items.length) {
    return (
      <>
        <ImportContactsPanel onFollow={followUser} onViewProfile={onViewProfile} />
        <EmptyState title={i18nText("ui.literals.k274b8df4761d")} message={i18nText("ui.literals.k523bcdc17445")} />
      </>
    );
  }

  return (
    <>
      <ImportContactsPanel onFollow={followUser} onViewProfile={onViewProfile} />
      <DiscoverList
        users={items}
        onBlock={blockUser}
        onFollow={followUser}
        onRemove={removeUser}
        onViewProfile={onViewProfile}
      />
    </>
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
