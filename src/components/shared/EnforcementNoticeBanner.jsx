import { useEffect, useState } from "react";
import { HiOutlineExclamationTriangle, HiOutlineNoSymbol } from "react-icons/hi2";
import { describeEnforcementNotice, getMyEnforcementNotices } from "../../Backend/services/enforcementNoticeService";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

// Shows the owner why their UrMall business, UrRide operator profile or UrRide
// company is restricted or suspended. The blocking itself is enforced by the
// database; this banner only explains it, using the message KunThai staff
// wrote for the owner (internal notes are never exposed).
export default function EnforcementNoticeBanner({ targetTypes = [], targetId = "", className = "" }) {
  useUiLocale();
  const [notices, setNotices] = useState([]);
  const typesKey = targetTypes.join(",");

  useEffect(() => {
    let active = true;
    getMyEnforcementNotices().then((rows) => {
      if (!active) return;
      const types = typesKey.split(",").filter(Boolean);
      setNotices(rows.filter((row) => (!types.length || types.includes(row.target_type)) && (!targetId || row.target_id === targetId)));
    });
    return () => { active = false; };
  }, [targetId, typesKey]);

  if (!notices.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {notices.map((notice) => {
        const view = describeEnforcementNotice(notice);
        const Icon = view.suspended ? HiOutlineNoSymbol : HiOutlineExclamationTriangle;
        return (
          <section
            key={`${notice.target_type}-${notice.target_id}`}
            role="status"
            className={`rounded-2xl border px-4 py-3 ${view.suspended ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
          >
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 shrink-0 text-xl" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-black">{translateUi(view.title)}</p>
                <p className="mt-0.5 text-xs font-semibold leading-5">{translateUi(view.detail)}</p>
                {view.message ? <p className="mt-1.5 whitespace-pre-wrap text-xs font-medium leading-5 opacity-90">{view.message}</p> : null}
                {view.until ? (
                  <p className="mt-1.5 text-[11px] font-black uppercase tracking-wide opacity-80">
                    {translateUi("Until")} {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(view.until)}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
