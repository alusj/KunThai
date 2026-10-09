import EmptyState from "../../../shared/EmptyState";
import ErrorState from "../../../shared/ErrorState";
import MyCircleList from "./MyCircleList";
import ShowMoreButton from "../components/ShowMoreButton";
import { t as i18nText } from "../../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function MyCircle({ connectionState, kind = "mycircle", onViewProfile }) {
  useUiLocale();
  const { items = [], loading = false, error = "", blockUser, followUser, removeUser, reload } = connectionState || {};

  if (error) {
    return <ErrorState message={translateUi(error)} onRetry={reload} />;
  }

  if (loading && !items.length) {
    return <ConnectionListSkeleton />;
  }

  if (!items.length) {
    return (
      <EmptyState
        title={kind === "followers" ? i18nText("ui.literals.k5bb01e901421") : i18nText("ui.literals.k5bb01e901421")}
        message={kind === "followers" ? i18nText("ui.literals.k2ff004b5c1ad") : i18nText("ui.literals.k7b869c3e17ab")}
      />
    );
  }

  return (
    <>
      <MyCircleList
        users={items}
        onBlock={blockUser}
        onFollow={followUser}
        onRemove={removeUser}
        onViewProfile={onViewProfile}
      />
      <ShowMoreButton connectionState={connectionState} />
    </>
  );
}

function ConnectionListSkeleton() {
  useUiLocale();
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
