import { HiOutlineCheck, HiOutlineFolder } from "react-icons/hi2";

import { itemIsInCollection } from "../../../../Backend/services/explore/savedService";
import { useI18n } from "../../../../i18n";

// Shown on demand under one saved post (from its "Add to collection" button).
export default function CollectionPicker({ collections, onManage, onToggle, postId }) {
  const { t } = useI18n();

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">{t("exploreProfileFix.collections")}</p>
      {collections.length ? (
        <div className="flex flex-wrap gap-2">
          {collections.map((collection) => {
            const active = itemIsInCollection(collection, postId);
            return (
              <button
                key={collection.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(collection.id, postId)}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-black ${
                  active ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {active ? <HiOutlineCheck /> : <HiOutlineFolder />}
                {collection.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-500">{t("exploreProfileFix.noCollections")}</p>
      )}
      {onManage ? (
        <button type="button" onClick={onManage} className="mt-3 text-xs font-black text-sky-700">
          {t("exploreProfileFix.manageCollections")}
        </button>
      ) : null}
    </div>
  );
}
