export default function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl bg-white px-4 py-2 font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Try again
        </button>
      )}
    </div>
  );
}
