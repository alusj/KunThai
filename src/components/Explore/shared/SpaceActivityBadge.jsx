import { describeSpaceActivity } from "../../../Backend/services/explore/spaceActivityModel";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

// The count next to a Space in the switcher: new likes, comments, shares,
// connections and unread inbox messages since the person last opened it.
// Unread messages turn it blue-and-red so a waiting customer stands out.
export default function SpaceActivityBadge({ activity, className = "" }) {
  useUiLocale();
  const total = Number(activity?.total || 0);
  if (!total) return null;
  const summary = describeSpaceActivity(activity, translateUi);
  const label = total > 99 ? "99+" : String(total);

  return (
    <span
      className={`inline-flex min-w-[1.35rem] flex-none items-center justify-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-4 text-white shadow-sm ring-2 ring-white ${
        activity.messages ? "bg-rose-600" : "bg-sky-600"
      } ${className}`}
      title={summary}
      aria-label={summary}
      role="status"
    >
      {activity.messages ? <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export function SpaceActivitySummary({ activity, className = "" }) {
  useUiLocale();
  if (!activity?.total) return null;
  return (
    <span className={`block truncate text-[11px] font-bold text-sky-700 ${className}`}>
      {describeSpaceActivity(activity, translateUi)}
    </span>
  );
}
