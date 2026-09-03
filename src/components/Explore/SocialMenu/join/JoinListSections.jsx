import { useState } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";

import { GLOBAL_COUNTRY_CODES } from "../../../../data/globalCountryCodes";

// The parts of an application that are lists rather than single answers:
// qualifications, previous roles, and skills. Each entry is saved on its own so
// a long application never depends on one large form submission surviving.

const INPUT_CLASS =
  "h-11 w-full rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200";
const TEXTAREA_CLASS =
  "w-full resize-none rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200";

const WIDTHS = {
  full: "sm:col-span-4",
  half: "sm:col-span-2",
  quarter: "sm:col-span-1",
};

function EntryField({ field, value, disabled, onChange }) {
  if (field.type === "boolean") {
    return (
      <label className={`flex items-center gap-3 ${WIDTHS[field.width] || WIDTHS.full}`}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 rounded border-slate-300 text-sky-700 focus:ring-sky-300"
        />
        <span className="text-sm font-bold text-slate-700">{field.label}</span>
      </label>
    );
  }

  return (
    <label className={`block ${WIDTHS[field.width] || WIDTHS.full}`}>
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
      {field.type === "textarea" ? (
        <textarea
          rows={3}
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      ) : field.type === "select" ? (
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${INPUT_CLASS} font-black`}
        >
          <option value="">Choose one</option>
          {field.options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>{optionLabel}</option>
          ))}
        </select>
      ) : field.type === "country" ? (
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${INPUT_CLASS} font-black`}
        >
          <option value="">Choose a country</option>
          {GLOBAL_COUNTRY_CODES.map((country) => (
            <option key={country.iso2} value={country.name}>{country.name}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "date" ? "date" : field.type === "year" ? "number" : "text"}
          min={field.type === "year" ? 1900 : undefined}
          max={field.type === "year" ? 2200 : undefined}
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT_CLASS}
        />
      )}
    </label>
  );
}

export default function RepeatableSection({
  addLabel,
  description,
  entries = [],
  fields,
  emptyEntry,
  readOnly = false,
  title,
  onSave,
  onRemove,
}) {
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const rows = entries.map((entry) => ({ ...entry, ...(drafts[entry.id] || {}) }));
  const pending = drafts.__new ? [{ id: "__new", ...emptyEntry, ...drafts.__new }] : [];

  function update(id, key, value) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));
  }

  async function save(entry) {
    setError("");
    setBusyId(entry.id);
    try {
      const payload = entry.id === "__new" ? { ...entry, id: undefined, sortOrder: entries.length } : entry;
      await onSave(payload);
      setDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError.message || "Could not save this entry.");
    } finally {
      setBusyId("");
    }
  }

  async function remove(entry) {
    setError("");
    if (entry.id === "__new") {
      setDrafts((current) => {
        const next = { ...current };
        delete next.__new;
        return next;
      });
      return;
    }
    setBusyId(entry.id);
    try {
      await onRemove(entry);
    } catch (removeError) {
      setError(removeError.message || "Could not remove this entry.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p> : null}
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setDrafts((current) => ({ ...current, __new: current.__new || {} }))}
            className="flex h-10 flex-none items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white"
          >
            <HiOutlinePlus className="text-base" /> {addLabel}
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}

      {!rows.length && !pending.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm font-bold text-slate-400">
          Nothing added yet.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {[...rows, ...pending].map((entry) => {
          const dirty = Boolean(drafts[entry.id]);
          return (
            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                {fields.map((field) => (
                  <EntryField
                    key={field.key}
                    field={field}
                    value={entry[field.key]}
                    disabled={readOnly || busyId === entry.id}
                    onChange={(value) => update(entry.id, field.key, value)}
                  />
                ))}
              </div>
              {!readOnly ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === entry.id || (!dirty && entry.id !== "__new")}
                    onClick={() => save(entry)}
                    className="h-10 rounded-xl bg-sky-700 px-4 text-xs font-black text-white disabled:opacity-40"
                  >
                    {busyId === entry.id ? "Saving…" : entry.id === "__new" ? "Add entry" : dirty ? "Save changes" : "Saved"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === entry.id}
                    onClick={() => remove(entry)}
                    className="grid h-10 w-10 place-items-center rounded-xl bg-white text-rose-600 shadow-sm disabled:opacity-40"
                    aria-label="Remove entry"
                  >
                    <HiOutlineTrash />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
