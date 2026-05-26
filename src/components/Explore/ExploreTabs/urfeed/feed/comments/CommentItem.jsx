import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineFlag,
  HiOutlineHandThumbUp,
  HiOutlineTrash,
} from "react-icons/hi2";

import { formatRelativeTime } from "../../../../../../Backend/services/exploreService";
import Avatar from "../../../../shared/Avatar";
import { pauseOtherExploreMedia } from "../../../../shared/singleMediaPlayback";

function isPlaceholderName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "profile";
}

function getAuthorName(comment) {
  const authorProfile = comment.authorProfile || {};
  const displayName = authorProfile.displayName || comment.author_name || "";
  const username = authorProfile.username || comment.author_username || "";

  if (!isPlaceholderName(displayName)) return displayName;
  if (username && username.toLowerCase() !== "user") return username;
  return comment.user_id ? `User ${String(comment.user_id).slice(0, 4)}` : "User";
}

function getAuthorUsername(comment) {
  const authorProfile = comment.authorProfile || {};
  return authorProfile.username || comment.author_username || "user";
}

export default function CommentItem({
  comment,
  currentUserId,
  isLiked,
  isOwner,
  liked,
  onDelete,
  onLike,
  onViewProfile,
  onReply,
  onReport,
  replies = [],
}) {
  const authorName = getAuthorName(comment);
  const authorUsername = getAuthorUsername(comment);

  function viewCommentProfile(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const authorProfile = comment.authorProfile || {};
    onViewProfile?.({
      userId: authorProfile.userId || comment.user_id || "",
      displayName: authorName,
      username: authorUsername,
      avatarUrl: authorProfile.avatarUrl || comment.author_avatar_url || "",
      accountType: authorProfile.accountType || "personal",
    });
  }

  return (
    <div className={`space-y-2 ${comment.pending ? "kt-comment-item-pending" : ""}`}>
      <div className="flex min-w-0 gap-3">
        <button type="button" onClick={viewCommentProfile} className="kt-pressable flex-none self-start rounded-full" aria-label={`View ${authorName} profile`}>
          <Avatar name={authorName} src={comment.author_avatar_url} size="sm" />
        </button>
        <div className="min-w-0 flex-1 rounded-[20px] bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={viewCommentProfile} className="kt-pressable block max-w-full truncate rounded-lg text-left text-sm font-black text-slate-950 hover:text-sky-700">
                {authorName}
              </button>
              <button type="button" onClick={viewCommentProfile} className="kt-pressable block max-w-full truncate rounded-lg text-left text-xs font-semibold text-slate-400 hover:text-sky-700">
                @{authorUsername} - {comment.pending ? "Sending..." : formatRelativeTime(comment.created_at)}
              </button>
            </div>
          </div>

          {comment.body ? <p className="kuntai-break mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p> : null}
          {comment.audio_url ? (
            <audio
              controls
              src={comment.audio_url}
              onPlay={(event) => pauseOtherExploreMedia(event.currentTarget)}
              className="mt-3 h-10 w-full min-w-0"
            />
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-black text-slate-500">
            <button type="button" disabled={comment.pending} onClick={() => onLike(comment.id)} className={`kt-pressable inline-flex items-center gap-1 rounded-lg disabled:opacity-60 ${liked ? "text-sky-700" : ""}`}>
              <HiOutlineHandThumbUp />
              {comment.likes_count || 0}
            </button>
            <button type="button" disabled={comment.pending} onClick={() => onReply(comment)} className="kt-pressable inline-flex items-center gap-1 rounded-lg disabled:opacity-60">
              <HiOutlineChatBubbleLeftRight />
              Reply
            </button>
            {comment.pending ? (
              <span className="inline-flex items-center gap-1 text-sky-700">Posting</span>
            ) : isOwner ? (
              <button type="button" onClick={() => onDelete(comment.id)} className="kt-pressable inline-flex items-center gap-1 rounded-lg text-rose-600">
                <HiOutlineTrash />
                Delete
              </button>
            ) : (
              <button type="button" onClick={() => onReport(comment.id)} className="kt-pressable inline-flex items-center gap-1 rounded-lg text-rose-600">
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
              isLiked={isLiked}
              isOwner={Boolean(currentUserId && reply.user_id === currentUserId)}
              liked={isLiked ? isLiked(reply.id) : liked}
              onDelete={() => onDelete(reply.id)}
              onLike={() => onLike(reply.id)}
              onViewProfile={onViewProfile}
              onReply={() => onReply(reply)}
              onReport={() => onReport(reply.id)}
              replies={reply.replies}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
