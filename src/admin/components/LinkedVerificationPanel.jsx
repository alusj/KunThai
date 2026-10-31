import { useEffect, useState } from "react";
import { Building2, CarFront, ExternalLink, LoaderCircle, UserRound } from "lucide-react";

import { caseStatusLabel, titleCase } from "../adminConfig";
import { getAdminCaseById, getTransportVerificationLinks } from "../adminService";
import { isVerifiedStatus, passengerVerificationStatus } from "../../components/services/passengerVerification";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

// UrRide verification cases: the company, fleets and operators connected to
// this case, each verified on its own. A reviewer sees who drives which fleet
// for which company and opens each check from here. Passengers see an operator
// as verified only when both the operator and the fleet are.

function statusTone(status) {
  const value = String(status || "");
  if (isVerifiedStatus(value)) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (["rejected", "not_verified"].includes(value)) return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-900 ring-amber-200";
}

function StatusPill({ status }) {
  useUiLocale();
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${statusTone(status)}`}>
      {translateUi(isVerifiedStatus(status) ? "Verified" : titleCase(status || "pending"))}
    </span>
  );
}

function LinkRow({ icon: Icon, title, detail, status, entry, currentCaseId, opening, onOpen, children }) {
  useUiLocale();
  const isCurrent = entry.caseId && entry.caseId === currentCaseId;
  return (
    <li className={`rounded-lg border bg-white p-3 ${isCurrent ? "border-sky-300 ring-1 ring-sky-200" : "border-zinc-200"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-zinc-100 text-zinc-600"><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-black text-zinc-950">{title}</p>
            <StatusPill status={status} />
          </div>
          <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500">
            {[detail, entry.caseId ? `${translateUi("Case")}: ${caseStatusLabel(entry.caseStatus)}` : translateUi("No verification case yet")].filter(Boolean).join(" · ")}
          </p>
          {children}
        </div>
        {isCurrent ? (
          <span className="flex-none rounded-md bg-sky-50 px-2 py-1 text-[11px] font-black text-sky-800">{translateUi("This case")}</span>
        ) : entry.caseId ? (
          <button
            type="button"
            disabled={Boolean(opening)}
            onClick={() => onOpen(entry.caseId)}
            className="flex h-8 flex-none items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {opening === entry.caseId ? <LoaderCircle className="animate-spin" size={13} /> : <ExternalLink size={13} />} {translateUi("Open")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function LinkedVerificationPanel({ item, onOpenCase }) {
  useUiLocale();
  const [links, setLinks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState("");
  const [openError, setOpenError] = useState("");
  const isTransport = item?.sector === "transport" && String(item?.resource_type || "").startsWith("transport_");

  useEffect(() => {
    if (!isTransport || !item?.id) {
      setLinks(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    getTransportVerificationLinks(item.id)
      .then((value) => { if (active) setLinks(value); })
      .catch(() => { if (active) setLinks(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isTransport, item?.id, item?.status]);

  if (!isTransport) return null;
  const companies = links?.companies || [];
  const fleets = links?.fleets || [];
  const operators = links?.operators || [];
  if (!loading && !companies.length && !fleets.length && !operators.length) return null;

  const operatorsById = new Map(operators.map((operator) => [operator.id, operator]));
  const companiesById = new Map(companies.map((company) => [company.id, company]));

  async function openCase(caseId) {
    if (!onOpenCase) return;
    setOpening(caseId);
    setOpenError("");
    try {
      const next = await getAdminCaseById(caseId);
      if (next) onOpenCase(next);
    } catch (error) {
      setOpenError(inlineErrorMessage(error, "Unable to open this case."));
    } finally {
      setOpening("");
    }
  }

  const rowProps = { currentCaseId: item.id, opening, onOpen: openCase };

  return (
    <section className="border-b border-zinc-200 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-zinc-950">{translateUi("Linked verifications")}</h3>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            {translateUi("Company, fleet and operator are verified separately. Passengers see the operator as verified only when both the operator and the fleet are verified.")}
          </p>
        </div>
        {loading ? <LoaderCircle className="flex-none animate-spin text-zinc-400" size={18} /> : null}
      </div>
      {openError ? <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{translateUi(openError)}</p> : null}

      {companies.length ? (
        <div className="mt-4">
          <p className="text-[11px] font-black uppercase text-zinc-400">{translateUi("Company")}</p>
          <ul className="mt-2 space-y-2">
            {companies.map((company) => (
              <LinkRow key={company.id} icon={Building2} title={company.name || translateUi("Company")} detail={company.code} status={company.status} entry={company} {...rowProps} />
            ))}
          </ul>
        </div>
      ) : null}

      {fleets.length ? (
        <div className="mt-4">
          <p className="text-[11px] font-black uppercase text-zinc-400">{translateUi("Fleets")}</p>
          <ul className="mt-2 space-y-2">
            {fleets.map((fleet) => {
              const operator = operatorsById.get(fleet.operatorId);
              const company = companiesById.get(fleet.companyId);
              const seen = passengerVerificationStatus(fleet.status, operator?.status);
              return (
                <LinkRow
                  key={fleet.id}
                  icon={CarFront}
                  title={fleet.name || translateUi("Fleet")}
                  detail={[fleet.plate, fleet.code, translateUi(fleet.kind === "solo" ? "Own vehicle" : "Company fleet")].filter(Boolean).join(" · ")}
                  status={fleet.status}
                  entry={fleet}
                  {...rowProps}
                >
                  <p className="mt-1 text-xs font-semibold text-zinc-600">
                    {operator ? `${translateUi("Driven by")} ${operator.name || operator.code}` : translateUi("No operator on this fleet")}
                    {company ? ` · ${translateUi("for")} ${company.name}` : ""}
                  </p>
                  {operator ? (
                    <p className={`mt-1 text-xs font-black ${isVerifiedStatus(seen) ? "text-emerald-700" : "text-amber-700"}`}>
                      {translateUi("Passengers see")}: {translateUi(isVerifiedStatus(seen) ? "Verified" : "Verification pending")}
                    </p>
                  ) : null}
                </LinkRow>
              );
            })}
          </ul>
        </div>
      ) : null}

      {operators.length ? (
        <div className="mt-4">
          <p className="text-[11px] font-black uppercase text-zinc-400">{translateUi("Operators")}</p>
          <ul className="mt-2 space-y-2">
            {operators.map((operator) => (
              <LinkRow key={operator.id} icon={UserRound} title={operator.name || translateUi("Operator")} detail={operator.code} status={operator.status} entry={operator} {...rowProps} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
