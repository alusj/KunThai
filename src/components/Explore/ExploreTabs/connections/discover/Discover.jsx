import { useMemo, useState } from "react";

import EmptyState from "../../../shared/EmptyState";
import SuggestionFilterMenu from "../../../shared/SuggestionFilterMenu";
import {
  applySuggestionFilter,
  readSuggestionFilter,
  suggestionReason,
  writeSuggestionFilter,
} from "../../../../../Backend/services/explore/suggestionFilters";
import { useI18n } from "../../../../../i18n";
import ErrorState from "../../../shared/ErrorState";
import DiscoverList from "./DiscoverList";
import ShowMoreButton from "../components/ShowMoreButton";
import ImportContactsPanel from "./ImportContactsPanel";
import { t as i18nText } from "../../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function Discover({ connectionState, onViewProfile }) {
  useUiLocale();
  const { t } = useI18n();
  const { items = [], loading = false, error = "", blockUser, followUser, removeUser, reload } = connectionState || {};
  const [filter, setFilter] = useState(readSuggestionFilter);
  // Same filter as the UrFeed suggestions card; the status chip shows why
  // each person is suggested, in the viewer's language.
  const visibleItems = useMemo(
    () =>
      applySuggestionFilter(items, filter).map((item) => {
        const reason = suggestionReason(item);
        return reason ? { ...item, status: t(reason.key, reason.vars) } : item;
      }),
    [items, filter, t],
  );

  function changeFilter(next) {
    setFilter(next);
    writeSuggestionFilter(next);
  }

  if (error) {
    return <ErrorState message={translateUi(error)} onRetry={reload} />;
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
      <div className="mb-3 flex justify-end">
        <SuggestionFilterMenu value={filter} onChange={changeFilter} />
      </div>
      {!visibleItems.length ? (
        <p className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
          {t("feed.filterEmpty")}
        </p>
      ) : null}
      <DiscoverList
        users={visibleItems}
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
