import { Copy, Share2 } from "lucide-react";
import { useState } from "react";

export default function PendingPromotionTasks({ tasks }) {
  const [message, setMessage] = useState("");
  const pendingTasks = Array.isArray(tasks) ? tasks : [];

  if (!pendingTasks.length) return null;

  async function shareTask(task) {
    const invite = task.task;
    if (!invite?.inviteUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: invite.shareMessage, title: "Join KunThai UrMall", url: invite.inviteUrl });
      } else {
        await navigator.clipboard.writeText(invite.shareMessage || invite.inviteUrl);
      }
      setMessage("Invite link ready. Credits count after verified people join.");
    } catch {
      setMessage("Copy the invite link and share it with people you trust.");
    }
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h3 className="text-lg font-black text-gray-950">Promotion tasks</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-amber-900">
        These products are live normally. Promoted placement unlocks after the verified-invite task is completed.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pendingTasks.map((task) => {
          const required = task.task?.requiredInvites || task.requiredInvites;
          const verified = task.task?.verifiedInvites || task.verifiedInvites || 0;
          const percent = required ? Math.min(100, (verified / required) * 100) : 0;
          return (
            <article key={task.id} className="rounded-lg border border-amber-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-gray-950">{task.productName}</p>
                  <p className="mt-1 text-xs font-bold text-gray-500">
                    {verified} / {required} verified invites
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                  Pending
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => shareTask(task)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                >
                  <Share2 size={15} /> Share
                </button>
                {task.task?.inviteUrl ? (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(task.task.inviteUrl)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-50"
                  >
                    <Copy size={15} /> Copy link
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {message ? <p className="mt-3 text-xs font-bold text-emerald-700">{message}</p> : null}
    </section>
  );
}
