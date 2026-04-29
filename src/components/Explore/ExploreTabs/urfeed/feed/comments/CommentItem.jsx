import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineFlag,
  HiOutlineHandThumbUp,
  HiOutlineTrash,
} from "react-icons/hi2";

import { formatRelativeTime } from "../../../../../../Backend/services/exploreService";
import Avatar from "../../../../shared/Avatar";

export default function CommentItem({
  comment,
  currentUserId,
  isOwner,
  liked,
  onDelete,
  onLike,
  onReply,
  onReport,
  replies = [],
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 gap-3">
        <Avatar name={comment.author_name || "KunThai User"} src={comment.author_avatar_url} size="sm" />
        <div className="min-w-0 flex-1 rounded-[20px] bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{comment.author_name || "KunThai User"}</p>
              <p className="truncate text-xs font-semibold text-slate-400">
                @{comment.author_username || "user"} - {formatRelativeTime(comment.created_at)}
              </p>
            </div>
          </div>

          {comment.body ? <p className="kuntai-break mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p> : null}
          {comment.audio_url ? <audio controls src={comment.audio_url} className="mt-3 h-10 w-full min-w-0" /> : null}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-black text-slate-500">
            <button type="button" onClick={() => onLike(comment.id)} className={`inline-flex items-center gap-1 ${liked ? "text-sky-700" : ""}`}>
              <HiOutlineHandThumbUp />
              {comment.likes_count || 0}
            </button>
            <button type="button" onClick={() => onReply(comment)} className="inline-flex items-center gap-1">
              <HiOutlineChatBubbleLeftRight />
              Reply
            </button>
            {isOwner ? (
              <button type="button" onClick={() => onDelete(comment.id)} className="inline-flex items-center gap-1 text-rose-600">
                <HiOutlineTrash />
                Delete
              </button>
            ) : (
              <button type="button" onClick={() => onReport(comment.id)} className="inline-flex items-center gap-1 text-rose-600">
                <HiOutlineFlag />
                Report
              </button>
            )}
          </div>
        </div>
      </div>

      {replies.length ? (
        <div className="ml-9 space-y-2 border-l border-slate-200 pl-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              isOwner={Boolean(currentUserId && reply.user_id === currentUserId)}
              liked={liked}
              onDelete={() => onDelete(reply.id)}
              onLike={() => onLike(reply.id)}
              onReply={() => onReply(reply)}
              onReport={() => onReport(reply.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
