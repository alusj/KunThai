import AttentionIcon from "./AttentionIcon";
import AttentionPriorityBadge from "./AttentionPriorityBadge";

export default function AttentionItem({ item, onAction }) {
  return (
    <article className={`rounded-xl border p-4 shadow-sm transition ${item.read ? "border-gray-200 bg-white" : "border-emerald-200 bg-emerald-50/90"}`}>
      <div className="flex gap-3">
        <AttentionIcon type={item.type} priority={item.priority} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="font-black text-gray-950">{item.title}</h4>
              <p className="mt-1 text-sm font-medium leading-5 text-gray-500">
                {item.description}
              </p>
            </div>
            <AttentionPriorityBadge priority={item.priority} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
              <span>{item.count} item{item.count === 1 ? "" : "s"}</span>
              <span className="h-1 w-1 rounded-full bg-gray-300" />
              <span>{item.dueLabel}</span>
            </div>

            <button
              type="button"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-black text-gray-800 transition hover:bg-gray-50"
              onClick={() => onAction?.(item)}
            >
              {item.actionLabel}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
