import { HiOutlineAtSymbol, HiOutlineHashtag } from "react-icons/hi2";

import { normalizeHashtag } from "../../../Backend/services/explore/hashtagService";
import Avatar from "./Avatar";

// Popup panel; render inside a `relative` wrapper around the input. Pair with
// useMentionHashtagAutocomplete from Backend/hooks.
export function MentionHashtagSuggestions({ trigger, results, loading, onSelect, placement = "top" }) {
  if (!trigger) return null;
  if (!loading && !results.length && !trigger.query) return null;

  const isMention = trigger.type === "mention";
  const positionClass = placement === "top" ? "bottom-[calc(100%+0.4rem)]" : "top-[calc(100%+0.4rem)]";

  return (
    <div
      className={`absolute inset-x-0 z-40 max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-950/15 ${positionClass}`}
      role="listbox"
      aria-label={isMention ? "Mention suggestions" : "Hashtag suggestions"}
    >
      <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {isMention ? <HiOutlineAtSymbol className="text-sm" /> : <HiOutlineHashtag className="text-sm" />}
        {isMention ? "Mention someone" : "Saved hashtags"}
      </p>
      {loading ? (
        <p className="px-3 py-2 text-xs font-bold text-slate-500">{isMention ? "Finding people..." : "Loading hashtags..."}</p>
      ) : null}
      {!loading && !results.length ? (
        <p className="px-3 py-2 text-xs font-bold text-slate-500">
          {isMention ? "No matching Explore profile." : `No saved hashtag yet — keep typing to create #${normalizeHashtag(trigger.query)}.`}
        </p>
      ) : null}
      {!loading && results.map((item) => (
        <button
          key={item.type === "people" ? item.id : item.tag}
          type="button"
          onClick={() => onSelect?.(item)}
          onMouseDown={(event) => event.preventDefault()}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50"
          role="option"
          aria-selected="false"
        >
          {item.type === "people" ? (
            <>
              <Avatar name={item.title || item.username || "Profile"} src={item.avatarUrl} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-950">{item.title}</span>
                <span className="block truncate text-xs font-bold text-slate-500">@{item.username}</span>
              </span>
            </>
          ) : (
            <>
              <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-sky-50 text-sky-700">
                <HiOutlineHashtag />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">#{item.tag}</span>
              <span className="flex-none rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                {item.personalUsageCount || item.usageCount} use{(item.personalUsageCount || item.usageCount) === 1 ? "" : "s"}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
