import { Share2 } from "lucide-react";

import { shareUrMallLink } from "../../../../Backend/services/shareCtaService";

export default function ProductSuccessToast({ message, onClose }) {
  if (!message) return null;

  const showShareCta = /success|added|updated|created|switched|saved/i.test(message);

  return (
    <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-emerald-700">{message}</p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Your store and catalog have been updated.
          </p>
          {showShareCta ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2">
              <p className="text-xs font-black leading-5 text-emerald-900">Share UrMall to help more buyers discover your products.</p>
              <button
                type="button"
                onClick={shareUrMallLink}
                className="mt-2 inline-flex h-9 items-center gap-2 rounded-2xl bg-gray-950 px-4 text-xs font-black text-white"
              >
                <Share2 size={14} />
                Share UrMall
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm font-black text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          aria-label="Close"
        >
          x
        </button>
      </div>
    </div>
  );
}
