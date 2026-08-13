import { HiOutlineFolderPlus, HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { t as i18nText } from "../../../../i18n/index";

export default function SavedToolbar({ query, onCreateCollection, onQueryChange }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-slate-500">
          <HiOutlineMagnifyingGlass className="flex-none text-lg" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={i18nText("ui.literals.k58b5cec7a5a2")}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={onCreateCollection}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white"
          aria-label={i18nText("ui.literals.kbe9ad140f5c9")}
        >
          <HiOutlineFolderPlus />
        </button>
      </div>
    </div>
  );
}
