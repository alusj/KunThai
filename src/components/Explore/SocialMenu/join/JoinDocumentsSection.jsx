import { useRef, useState } from "react";
import { HiOutlineArrowUpTray, HiOutlineDocumentText, HiOutlineTrash } from "react-icons/hi2";

import {
  createApplicationDocumentUrl,
  deleteApplicationDocument,
  uploadApplicationDocument,
  validateApplicationDocument,
} from "../../../../Backend/services/explore/joinKunThaiService";

const DOCUMENT_TYPES = [
  ["cv", "CV or resume"],
  ["cover_letter", "Cover letter"],
  ["certificate", "Certificate"],
  ["portfolio", "Portfolio"],
  ["supporting", "Supporting document"],
];

const DOCUMENT_TYPE_LABELS = Object.fromEntries(DOCUMENT_TYPES);

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function JoinDocumentsSection({ applicationId, documents = [], readOnly = false, onChange }) {
  const [documentType, setDocumentType] = useState("cv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function choose(event) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    const validation = validateApplicationDocument(file);
    if (validation) {
      setError(validation);
      return;
    }

    setError("");
    setBusy(true);
    try {
      const created = await uploadApplicationDocument(applicationId, file, documentType);
      onChange([...documents, created]);
    } catch (uploadError) {
      setError(uploadError.message || "Could not attach that file.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(document) {
    setError("");
    setBusy(true);
    try {
      await deleteApplicationDocument(document);
      onChange(documents.filter((entry) => entry.id !== document.id));
    } catch (removeError) {
      setError(removeError.message || "Could not remove that file.");
    } finally {
      setBusy(false);
    }
  }

  async function open(document) {
    const url = await createApplicationDocumentUrl(document.storagePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("That file could not be opened right now.");
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-slate-950">Attachments</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
        PDF, Word, or image files up to 10MB each. Do not attach identity documents at this stage.
      </p>

      {!readOnly ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="sr-only">Document type</span>
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-sky-200"
            >
              {DOCUMENT_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-50"
          >
            <HiOutlineArrowUpTray className="text-lg" /> {busy ? "Working…" : "Attach file"}
          </button>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
        onChange={choose}
        className="hidden"
      />

      {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}

      {documents.length ? (
        <ul className="mt-4 space-y-2">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
                <HiOutlineDocumentText className="text-xl" />
              </span>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => open(document)} className="block max-w-full truncate text-left text-sm font-black text-slate-950 hover:text-sky-700">
                  {document.fileName || "Attachment"}
                </button>
                <p className="mt-0.5 text-xs font-bold text-slate-400">
                  {DOCUMENT_TYPE_LABELS[document.documentType] || "Document"}
                  {document.byteSize ? ` · ${formatSize(document.byteSize)}` : ""}
                </p>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(document)}
                  className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-rose-600 shadow-sm disabled:opacity-40"
                  aria-label={`Remove ${document.fileName || "attachment"}`}
                >
                  <HiOutlineTrash />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm font-bold text-slate-400">
          Nothing attached yet.
        </p>
      )}
    </section>
  );
}
