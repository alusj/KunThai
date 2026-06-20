import { Repeat2 } from "lucide-react";

import { buildExploreRepostSnapshot } from "../../../Backend/services/explore/repostService";
import Avatar from "../shared/Avatar";
import ExpandablePostText from "./ExpandablePostText";

export default function RepostPreview({ post, sourcePost = null, compact = false }) {
  const source = sourcePost ? buildExploreRepostSnapshot(sourcePost) : post?.media_meta?.repost || post?.mediaMeta?.repost;
  if (!source) return null;

  return (
    <section className={`overflow-hidden rounded-[22px] border-2 border-slate-200 bg-white shadow-sm ${compact ? "" : "mx-4 mb-4"}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-sky-700">
        <Repeat2 size={15} strokeWidth={2.5} />
        Reposted from {source.sourceType === "swip" ? "Swip" : "UrFeed"}
      </div>
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar name={source.authorName} src={source.authorAvatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{source.authorName || "Profile"}</p>
          <p className="truncate text-xs font-bold text-slate-500">@{source.authorUsername || "user"}</p>
        </div>
      </div>
      {source.body ? (
        <ExpandablePostText
          text={source.body}
          className="px-4 py-3 text-sm font-semibold leading-6"
          textClassName="text-slate-800"
          controlClassName="text-sky-700"
        />
      ) : null}
      {source.imageUrl ? <img src={source.imageUrl} alt="Reposted media" className="mt-3 aspect-[4/3] w-full object-cover" /> : null}
      {source.videoUrl ? (
        <video src={source.videoUrl} controls playsInline preload="metadata" className="mt-3 aspect-video w-full bg-slate-950 object-cover" />
      ) : null}
      {source.audioUrl ? (
        <div className="p-4">
          <audio src={source.audioUrl} controls preload="metadata" className="w-full" />
        </div>
      ) : null}
    </section>
  );
}
