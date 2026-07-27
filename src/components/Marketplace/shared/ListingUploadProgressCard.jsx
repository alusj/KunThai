import { Check, LoaderCircle } from "lucide-react";

import { useI18n, t } from "../../../i18n";

const LISTING_UPLOAD_STAGES = [
  { id: "prepare", labelKey: "urmall.upload.prepare" },
  { id: "cover", labelKey: "urmall.upload.cover" },
  { id: "gallery", labelKey: "urmall.upload.gallery" },
  { id: "video", labelKey: "urmall.upload.video" },
  { id: "save", labelKey: "urmall.upload.save" },
];

export default function ListingUploadProgressCard({ stage, title }) {
  useI18n();
  const cardTitle = title || t("urmall.upload.title");
  const activeIndex = LISTING_UPLOAD_STAGES.findIndex((step) => step.id === stage);
  if (activeIndex < 0) return null;
  const percent = Math.round(((activeIndex + 1) / LISTING_UPLOAD_STAGES.length) * 100);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-gray-950">{cardTitle}</p>
        <span className="text-xs font-black text-emerald-700">{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-3 grid gap-1.5">
        {LISTING_UPLOAD_STAGES.map((step, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li key={step.id} className={`flex items-center gap-2 text-xs font-bold ${current ? "text-emerald-700" : done ? "text-gray-500" : "text-gray-300"}`}>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : current ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-300"}`}>
                {done ? <Check size={12} /> : current ? <LoaderCircle size={12} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              {t(step.labelKey)}
              {current ? "..." : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
