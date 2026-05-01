import { AlertTriangle } from "lucide-react";

export default function PayoutWarning({ warning }) {
  if (!warning?.active) {
    return null;
  }

  return (
    <article className="rounded-lg border border-red-100 bg-red-50 p-4">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-red-700">
          <AlertTriangle size={18} strokeWidth={2.3} />
        </span>
        <div>
          <p className="font-black text-red-900">{warning.title}</p>
          <p className="mt-1 text-sm font-medium leading-5 text-red-700">
            {warning.description}
          </p>
        </div>
      </div>
    </article>
  );
}
