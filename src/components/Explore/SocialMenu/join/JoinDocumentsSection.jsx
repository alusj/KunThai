import { useRef, useState } from "react";
import { HiOutlineArrowUpTray, HiOutlineDocumentText, HiOutlineTrash } from "react-icons/hi2";

import {
  createApplicationDocumentUrl,
  deleteApplicationDocument,
  uploadApplicationDocument,
  validateApplicationDocument,
} from "../../../../Backend/services/explore/joinKunThaiService";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage } from "../../../../Backend/services/friendlyErrorService";

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
  useUiLocale();
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
      setError(inlineErrorMessage(uploadError, i18nText("ui.literals.kd5dec6727d4c")));
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
      setError(inlineErrorMessage(removeError, i18nText("ui.literals.k89f1b9244b5b")));
    } finally {
      setBusy(false);
    }
  }

  // The window opens synchronously inside the tap (so it is not treated as
  // a popup), then points at the signed link once it arrives.
  async function open(document) {
    setError("");
    const opened = window.open("", "_blank");
    if (opened) {
      try {
        opened.opener = null;
        opened.document.title = i18nText("exploreMessagesFix.joinOpeningDocument");
        opened.document.body.textContent = i18nText("exploreMessagesFix.joinOpeningDocument");
      } catch {
        // Some browsers do not allow writing to the new window; it still loads.
      }
    }
    const url = await createApplicationDocumentUrl(document.storagePath);
    if (url && opened && !opened.closed) {
      opened.location.href = url;
    } else if (url) {
      window.location.assign(url);
    } else {
      opened?.close();
      setError(i18nText("ui.literals.k03533e3a4c4a"));
    }
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.k6771ade6e896")}</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
        {i18nText("ui.literals.ke731612ed5b2")}
      </p>

      {!readOnly ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="sr-only">{i18nText("ui.literals.k300b6ef0cdd8")}</span>
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-sky-200"
            >
              {DOCUMENT_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{translateUi(label)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-50"
          >
            <HiOutlineArrowUpTray className="text-lg" /> {busy ? i18nText("ui.literals.k13b7bfcac438") : i18nText("ui.literals.k0c431f496995")}
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

      {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}

      {documents.length ? (
        <ul className="mt-4 space-y-2">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-sky-700 shadow-sm">
                <HiOutlineDocumentText className="text-xl" />
              </span>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => open(document)} className="block max-w-full truncate text-left text-sm font-black text-slate-950 hover:text-sky-700">
                  {document.fileName || i18nText("ui.literals.k83a56249e5cf")}
                </button>
                <p className="mt-0.5 text-xs font-bold text-slate-400">
                  {DOCUMENT_TYPE_LABELS[document.documentType] || i18nText("ui.literals.ke214b8a29923")}
                  {document.byteSize ? ` · ${formatSize(document.byteSize)}` : ""}
                </p>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(document)}
                  className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-rose-600 shadow-sm disabled:opacity-40"
                  aria-label={i18nText("ui.literals.ka2d40d3386fc", { value0: document.fileName || "attachment" })}
                >
                  <HiOutlineTrash />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm font-bold text-slate-400">
          {i18nText("ui.literals.ke47f0ed232b9")}
        </p>
      )}
    </section>
  );
}
