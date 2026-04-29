import { HiOutlineHashtag, HiOutlinePlayCircle, HiOutlineUserCircle } from "react-icons/hi2";

import Avatar from "../../../shared/Avatar";

function ResultIcon({ item }) {
  if (item.type === "people") return <Avatar name={item.title} src={item.avatarUrl} size="sm" />;
  if (item.type === "swip") return <HiOutlinePlayCircle className="text-xl text-sky-700" />;
  if (item.type === "hashtag") return <HiOutlineHashtag className="text-xl text-sky-700" />;
  return <HiOutlineUserCircle className="text-xl text-sky-700" />;
}

export default function SearchResultItem({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-center gap-3 rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-left transition hover:bg-slate-50"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-sky-50">
        <ResultIcon item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-slate-950">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{item.subtitle}</span>
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black capitalize text-slate-500">
        {item.type}
      </span>
    </button>
  );
}
