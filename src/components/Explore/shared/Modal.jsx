export default function Modal({ open, title, children, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/45" onClick={onClose} />
      <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-lg rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </>
  );
}
