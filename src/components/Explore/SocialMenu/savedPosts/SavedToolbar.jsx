import { HiOutlineFolderPlus, HiOutlineMagnifyingGlass } from "react-icons/hi2";

export default function SavedToolbar({ query, onCreateCollection, onQueryChange }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-slate-500">
          <HiOutlineMagnifyingGlass className="flex-none text-lg" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search your saved posts and videos..."
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={onCreateCollection}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white"
          aria-label="Create collection"
        >
          <HiOutlineFolderPlus />
        </button>
      </div>
    </div>
  );
}
