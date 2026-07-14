import { CheckCircle2, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function HealthScoreCard({ health, onEditProfile }) {
  const [expanded, setExpanded] = useState(false);
  const missingItems = health.missingItems || [];
  const complete = Number(health.score || 0) >= 100 || missingItems.length === 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-gray-500">{health.label}</p>
          <p className="mt-1 text-3xl font-black text-gray-950">
            {health.score}%
          </p>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-900">
          {health.score}
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-emerald-500"
          style={{ width: `${health.score}%` }}
        />
      </div>

      <p className="mt-3 text-sm font-medium leading-5 text-gray-500">
        {health.nextStep}
      </p>

      <button
        type="button"
        onClick={() => {
          if (complete) {
            onEditProfile?.();
            return;
          }
          setExpanded((current) => !current);
        }}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
      >
        {complete ? "Review setup" : expanded ? "Hide missing details" : `View missing details (${missingItems.length})`}
        <ChevronRight size={16} />
      </button>

      {expanded && !complete ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-gray-500">
            Missing details
          </p>
          <ul className="mt-3 space-y-2">
            {missingItems.slice(0, 7).map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm font-bold text-gray-700">
                <CheckCircle2 className="mt-0.5 shrink-0 text-gray-400" size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {missingItems.length > 7 ? (
            <p className="mt-2 text-xs font-bold text-gray-500">
              +{missingItems.length - 7} more details
            </p>
          ) : null}
          <button
            type="button"
            onClick={onEditProfile}
            className="mt-3 h-10 w-full rounded-lg bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
          >
            Fix now
          </button>
        </div>
      ) : null}
    </section>
  );
}
