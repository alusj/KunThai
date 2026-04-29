import { HiOutlineExclamationTriangle } from "react-icons/hi2";

export default function ErrorState({ message = "Something went wrong.", onRetry }) {
  return (
    <div className="rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-white text-xl text-rose-600">
          <HiOutlineExclamationTriangle />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-6">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-xl bg-white px-4 py-2 font-black text-rose-700 transition hover:bg-rose-100"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
