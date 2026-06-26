import ActivityIcon from "./ActivityIcon";
import ActivityStatusBadge from "./ActivityStatusBadge";

export default function ActivityItem({ actionBusy = false, activity, dismissing = false, onAction, onDone }) {
  function handleDone(event) {
    event.stopPropagation();
    onDone?.(activity);
  }

  function handleAction(event) {
    event.stopPropagation();
    onAction?.(activity);
  }

  return (
    <article className={`relative flex gap-3 border-t border-gray-100 py-4 first:border-t-0 first:pt-0 last:pb-0 ${dismissing ? "kt-notification-wipe-out" : ""}`}>
      <ActivityIcon type={activity.type} status={activity.status} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-gray-950">{activity.title}</p>
            <p className="mt-1 text-sm font-medium leading-5 text-gray-500">
              {activity.description}
            </p>
          </div>
          <ActivityStatusBadge status={activity.status} onDone={handleDone} />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black text-gray-400">
            <span>{activity.time}</span>
            {activity.meta ? (
              <>
                <span className="h-1 w-1 rounded-full bg-gray-300" />
                <span>{activity.meta}</span>
              </>
            ) : null}
          </div>

          {activity.actionLabel ? (
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50"
              disabled={actionBusy}
              onClick={handleAction}
            >
              {actionBusy ? "Opening..." : activity.actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
