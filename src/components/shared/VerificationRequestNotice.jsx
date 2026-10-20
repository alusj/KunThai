import { useEffect, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineDocumentPlus } from "react-icons/hi2";
import { readMyVerificationRequests } from "../../Backend/services/verificationRequestService";
import { uiText as translateUi, useI18n } from "../../i18n";

// Tells a seller, operator or company what KunThai still needs to finish
// verifying them, or that the documents they sent are back with a reviewer.
// Renders nothing when there is no open request.
export default function VerificationRequestNotice({ sector, resourceTypes = null, actionLabel = "", onAction, className = "" }) {
  useI18n();
  const [requests, setRequests] = useState([]);
  const typesKey = resourceTypes ? resourceTypes.join(",") : "";

  useEffect(() => {
    let active = true;
    const types = typesKey ? typesKey.split(",") : null;
    const load = () => readMyVerificationRequests({ sector }).then((rows) => {
      if (active) setRequests(types ? rows.filter((entry) => types.includes(entry.resourceType)) : rows);
    });
    load();
    // Back from the upload screen: show the new state.
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [sector, typesKey]);

  if (!requests.length) return null;

  return (
    <div className={`grid gap-3 ${className}`}>
      {requests.map((request) => {
        const needed = request.stage === "needs_documents";
        return (
          <section
            key={request.caseId}
            role="status"
            className={`rounded-3xl border p-4 shadow-sm ${needed ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
          >
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl text-white ${needed ? "bg-amber-500" : "bg-emerald-600"}`}>
                {needed ? <HiOutlineDocumentPlus aria-hidden="true" /> : <HiOutlineCheckCircle aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-black uppercase tracking-[0.14em] ${needed ? "text-amber-700" : "text-emerald-700"}`}>
                  {translateUi(needed ? "Action needed" : "Sent for review")}
                </p>
                <h3 className="mt-0.5 text-base font-black leading-snug text-slate-950">
                  {translateUi(needed ? "KunThai needs more documents" : "Thanks — KunThai is reviewing your documents")}
                </h3>
                {request.title ? <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{request.title}</p> : null}
              </div>
            </div>

            {needed ? (
              <>
                {request.items?.length ? (
                  <ul className="mt-3 grid gap-1.5">
                    {request.items.map((entry) => (
                      <li key={entry} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-bold text-slate-800">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                        {translateUi(entry)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {request.note ? <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">{request.note}</p> : null}
                <p className="mt-2 text-xs font-bold leading-5 text-amber-800">
                  {translateUi("Upload them and your verification goes back to KunThai automatically.")}
                </p>
                {onAction && actionLabel ? (
                  <button type="button" onClick={onAction} className="kt-pressable mt-3 h-11 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
                    {translateUi(actionLabel)}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm font-semibold leading-6 text-emerald-900">
                {translateUi("You sent what was asked. You'll get a notification when the review is done.")}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
