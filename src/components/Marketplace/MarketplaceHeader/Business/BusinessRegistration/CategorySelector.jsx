import { useEffect, useRef, useState } from "react";
import { HiOutlineChevronDown, HiOutlineXMark } from "react-icons/hi2";

export default function CategorySelector({
  categories,
  selected,
  otherValue,
  error,
  otherError,
  onToggle,
  onOtherChange,
  onOtherAdd,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-gray-800">Business categories</p>
        <p className="text-sm font-bold text-gray-500">{selected.length}/5 selected</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left text-sm font-bold transition ${
          open ? "border-blue-500 ring-4 ring-blue-500/10" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className="min-w-0 flex-1">
          {selected.length ? (
            <span className="flex flex-wrap gap-2">
              {selected.slice(0, 3).map((category) => (
                <span key={category} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">
                  {category}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(category);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggle(category);
                      }
                    }}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-100"
                    aria-label={`Remove ${category}`}
                  >
                    <HiOutlineXMark />
                  </span>
                </span>
              ))}
              {selected.length > 3 ? <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">+{selected.length - 3}</span> : null}
            </span>
          ) : (
            <span className="text-gray-400">Select up to 5 business categories</span>
          )}
        </span>
        <HiOutlineChevronDown className={`flex-none text-lg text-gray-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="max-h-80 overflow-y-auto p-2">
            {categories.map((category) => {
              const active = selected.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onToggle(category)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-black transition ${
                    active ? "bg-blue-50 text-blue-800" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span>{category}</span>
                  {active ? <span className="text-xs uppercase tracking-[0.18em]">Selected</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selected.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onToggle(category)}
              className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-700 hover:bg-red-50 hover:text-red-700"
            >
              {category}
              <HiOutlineXMark />
            </button>
          ))}
        </div>
      ) : null}

      {selected.includes("Other") ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-black text-gray-800">Tell us what we missed</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={otherValue}
              onChange={(event) => onOtherChange(event.target.value)}
              placeholder="Type your business category"
              className="h-11 flex-1 rounded-lg border border-gray-300 px-3 text-sm font-medium outline-none transition focus:border-blue-500"
            />
            <button
              type="button"
              onClick={onOtherAdd}
              className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-black text-white hover:bg-gray-800"
            >
              Add Category
            </button>
          </div>
          {otherError ? <p className="mt-2 text-xs font-bold text-red-600">{otherError}</p> : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
