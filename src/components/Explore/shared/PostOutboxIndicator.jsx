import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CloudUpload, Loader2, RotateCcw, X } from "lucide-react";

import { OUTBOX_STATUS } from "../../../Backend/services/explore/postOutboxCore";
import {
  POST_OUTBOX_EVENT,
  discardOutboxRecord,
  isPostOutboxReady,
  listOutboxRecords,
  retryOutboxRecord,
} from "../../../Backend/services/explore/postOutbox";

// A small, self-contained status chip for posts waiting in the outbox. Shows a
// "Posting…" state while items retry, and a "didn't send" state with Retry /
// Discard once an item gives up. Renders nothing when the queue is empty, and
// is a no-op entirely when the outbox is disabled.
export default function PostOutboxIndicator() {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    if (!isPostOutboxReady()) return undefined;
    let alive = true;
    const refresh = () =>
      listOutboxRecords()
        .then((list) => {
          if (alive) setRecords(Array.isArray(list) ? list : []);
        })
        .catch(() => {});
    refresh();
    const onEvent = () => refresh();
    window.addEventListener(POST_OUTBOX_EVENT, onEvent);
    // Backstop for backoff transitions that happen between events.
    const timer = window.setInterval(refresh, 5000);
    return () => {
      alive = false;
      window.removeEventListener(POST_OUTBOX_EVENT, onEvent);
      window.clearInterval(timer);
    };
  }, []);

  const active = records.filter(
    (record) => record.status === OUTBOX_STATUS.PENDING || record.status === OUTBOX_STATUS.SENDING,
  );
  const failed = records.filter((record) => record.status === OUTBOX_STATUS.FAILED);

  if (typeof document === "undefined" || (!active.length && !failed.length)) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[1150] flex justify-center px-3"
      style={{ bottom: "calc(max(0.75rem, var(--kt-safe-area-bottom)) + 4.75rem)" }}
      role="status"
      aria-live="polite"
    >
      <div className="kt-toast-expand-in pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-950/10 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        {failed.length ? (
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <CloudUpload size={18} strokeWidth={2.3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900 dark:text-white">
                {failed.length} post{failed.length > 1 ? "s" : ""} didn’t send
              </p>
              <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Your draft is safe. Retry when your connection is better.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => failed.forEach((record) => retryOutboxRecord(record.id))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  <RotateCcw size={13} strokeWidth={2.5} /> Retry {failed.length > 1 ? "all" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => failed.forEach((record) => discardOutboxRecord(record.id))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <X size={13} strokeWidth={2.5} /> Discard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Loader2 size={18} className="animate-spin" strokeWidth={2.3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900 dark:text-white">
                Posting{active.length > 1 ? ` ${active.length} posts` : ""}…
              </p>
              <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                We’ll finish automatically when your connection is ready.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
