import { useState } from "react";
import { HiOutlinePencilSquare, HiOutlineTrash } from "react-icons/hi2";

import { collectionNameTaken, normalizeCollectionName } from "../../../../Backend/services/explore/profilePostsModel";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n } from "../../../../i18n";

// Create, rename and delete saved collections. Names are unique (ignoring case).
export default function CollectionManager({ collections, onClose, onDeleted }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");
  const list = collections.collections;

  function createCollection(event) {
    event.preventDefault();
    const title = normalizeCollectionName(name);
    if (!title) return;
    if (collectionNameTaken(list, title)) {
      setMessage(t("exploreProfileFix.collectionDuplicate"));
      return;
    }
    try {
      collections.createCollection(title);
      setName("");
      setMessage("");
      showToast(t("exploreProfileFix.collectionCreated"), "success");
    } catch {
      setMessage(t("exploreProfileFix.collectionDuplicate"));
    }
  }

  function saveRename(event) {
    event.preventDefault();
    const title = normalizeCollectionName(editName);
    if (!title || !editingId) return;
    if (collectionNameTaken(list, title, editingId)) {
      setMessage(t("exploreProfileFix.collectionDuplicate"));
      return;
    }
    try {
      collections.renameCollection(editingId, title);
      setEditingId("");
      setMessage("");
      showToast(t("exploreProfileFix.collectionRenamed"), "success");
    } catch {
      setMessage(t("exploreProfileFix.collectionDuplicate"));
    }
  }

  function removeCollection(collection) {
    if (!window.confirm(t("exploreProfileFix.deleteCollectionConfirm", { name: collection.name }))) return;
    collections.deleteCollection(collection.id);
    onDeleted?.(collection.id);
    showToast(t("exploreProfileFix.collectionDeleted"), "success");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/30 px-4 pb-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("exploreProfileFix.manageCollections")}
        className="max-h-[80vh] w-full overflow-y-auto rounded-[24px] bg-white p-4 shadow-2xl sm:mx-auto sm:max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">{t("exploreProfileFix.newCollection")}</p>
        <form className="mt-3 flex gap-2" onSubmit={createCollection}>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setMessage("");
            }}
            maxLength={40}
            aria-label={t("exploreProfileFix.collectionName")}
            placeholder={t("exploreProfileFix.collectionName")}
            className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-800 outline-none"
            autoFocus
          />
          <button type="submit" disabled={!name.trim()} className="h-11 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">
            {t("exploreProfileFix.create")}
          </button>
        </form>
        {message ? <p className="mt-2 text-xs font-bold text-rose-600" role="alert">{message}</p> : null}

        <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-slate-400">{t("exploreProfileFix.collections")}</p>
        {list.length ? (
          <ul className="mt-2 space-y-2">
            {list.map((collection) => (
              <li key={collection.id} className="rounded-2xl bg-slate-50 px-3 py-2">
                {editingId === collection.id ? (
                  <form className="flex gap-2" onSubmit={saveRename}>
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      maxLength={40}
                      aria-label={t("exploreProfileFix.renameCollection")}
                      className="h-10 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm font-bold text-slate-800 outline-none"
                      autoFocus
                    />
                    <button type="submit" className="h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white">{t("exploreProfileFix.save")}</button>
                    <button type="button" onClick={() => setEditingId("")} className="h-10 rounded-xl bg-white px-3 text-xs font-black text-slate-600">
                      {t("exploreProfileFix.cancel")}
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">{collection.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(collection.id);
                        setEditName(collection.name);
                        setMessage("");
                      }}
                      aria-label={t("exploreProfileFix.renameCollection")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600"
                    >
                      <HiOutlinePencilSquare />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCollection(collection)}
                      aria-label={t("exploreProfileFix.deleteCollection")}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-rose-600"
                    >
                      <HiOutlineTrash />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-semibold text-slate-500">{t("exploreProfileFix.noCollections")}</p>
        )}

        <button type="button" onClick={onClose} className="mt-4 h-11 w-full rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
          {t("exploreProfileFix.done")}
        </button>
      </div>
    </div>
  );
}
