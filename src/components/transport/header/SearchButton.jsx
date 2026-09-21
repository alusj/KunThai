// Opens transport identity search for operators, codes, plates, and fleet types.

import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, Search, Star, X } from "lucide-react";

import AppPortal from "../../shared/AppPortal";
import { PremiumHeaderButton } from "../../shared/PremiumHeader";
import { fetchTransportFleets } from "../../services/transportFleetService";
import { searchPublicTransportCompanies } from "../../services/publicTransportCompanyService";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { openPublicCodeResult } from "../../../Backend/services/publicCodeService";
import PublicCodeResultCard from "../../shared/PublicCodeResultCard";
import { usePublicCodeLookup } from "../../../Backend/hooks/usePublicCodeLookup";
import VerificationBadge from "../verification/VerificationBadge";
import { useI18n, t } from "../../../i18n";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";

// Search scopes shown as pills so a passenger can target a specific identity —
// car name, plate, service category, operator code, or pickup area — instead of
// only a broad free-text match.
const SEARCH_SCOPES = [
  { id: "all", labelKey: "urride.search.scopeAll" },
  { id: "company", label: "Companies" },
  { id: "car", labelKey: "urride.search.scopeCar" },
  { id: "plate", labelKey: "urride.search.scopePlate" },
  { id: "category", labelKey: "urride.search.scopeCategory" },
  { id: "code", labelKey: "urride.search.scopeCode" },
  { id: "location", labelKey: "urride.search.scopeLocation" },
];

const SCOPE_FIELDS = {
  all: ["fleetName", "operatorName", "operatorId", "plateNumber", "displayType", "fleetType", "serviceCategory", "currentLocation", "lastKnownLocation", "operatingArea", "companyName", "companyCode"],
  company: ["companyName", "companyCode"],
  car: ["fleetName", "operatorName"],
  plate: ["plateNumber"],
  category: ["serviceCategory", "fleetType", "displayType"],
  code: ["operatorId", "companyCode"],
  location: ["currentLocation", "lastKnownLocation", "operatingArea"],
};

function matchesSearch(fleet, query, scope = "all") {
  const value = query.trim().toLowerCase();
  if (!value) return true;

  const fields = SCOPE_FIELDS[scope] || SCOPE_FIELDS.all;
  return fields
    .map((field) => fleet[field])
    .filter(Boolean)
    .some((item) => String(item).toLowerCase().includes(value));
}

export default function SearchButton({ onOpenChange, onViewCompany, onViewFleet }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportFleets({ mode: "topRated", fleetType: null })
      .then((items) => {
        if (alive) setFleets(items);
      })
      .catch((err) => {
        if (alive) {
          setError(inlineErrorMessage(err, t("urride.search.loadError")));
          setFleets([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    const value = query.trim();
    if (!open || value.length < 2 || !["all", "company", "code"].includes(scope)) {
      setCompanies([]);
      setCompanyLoading(false);
      setCompanyError("");
      return undefined;
    }

    let alive = true;
    const timer = window.setTimeout(() => {
      setCompanyLoading(true);
      setCompanyError("");
      searchPublicTransportCompanies(value, { country: getActiveCountryProfile().name || "" })
        .then((items) => {
          if (alive) setCompanies(items);
        })
        .catch((searchError) => {
          if (alive) {
            setCompanies([]);
            setCompanyError(inlineErrorMessage(searchError, "Company search is temporarily unavailable."));
          }
        })
        .finally(() => {
          if (alive) setCompanyLoading(false);
        });
    }, 220);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, query, scope]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  const results = useMemo(
    () => (scope === "company" ? [] : fleets.filter((fleet) => matchesSearch(fleet, query, scope)).slice(0, 20)),
    [fleets, query, scope],
  );
  const codeLookup = usePublicCodeLookup(query);

  function openCodeResult(result) {
    setOpen(false);
    openPublicCodeResult(result);
  }

  return (
    <>
      <PremiumHeaderButton
        icon={Search}
        label={t("urride.search.button")}
        onClick={() => setOpen(true)}
        title={t("urride.search.button")}
      />

      {open ? (
        <AppPortal>
        <div className="kt-backdrop fixed inset-0 z-[1200] px-3 py-4">
          <div className="mx-auto flex min-h-full w-full max-w-2xl items-start justify-center pt-10">
            <section className="kt-modal-enter w-full overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-green-700">
                    {t("urride.search.eyebrow")}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    {t("urride.search.title")}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {t("urride.search.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="kt-touchable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                  aria-label={t("urride.search.close")}
                >
                  <X size={18} />
                </button>
              </header>

              <div className="p-4">
                <label className="relative block">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("urride.search.placeholder")}
                    autoFocus
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-slate-950 outline-none focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
                  />
                </label>

                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {SEARCH_SCOPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScope(item.id)}
                      className={`h-9 flex-none rounded-2xl px-4 text-sm font-bold transition ${
                        scope === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.label || t(item.labelKey)}
                    </button>
                  ))}
                </div>

                <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                  {codeLookup.kind && codeLookup.kind !== "urride" ? (
                    <PublicCodeResultCard lookup={codeLookup} surface="urride" onOpen={openCodeResult} />
                  ) : null}
                  {companyLoading ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{i18nText("ui.literals.kb3cab3f793f0")}</p> : null}
                  {companyError ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{companyError}</p> : null}
                  {companies.map((company) => (
                    <article key={`company-${company.id}`} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white"><Building2 size={20} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">{i18nText("ui.literals.kd19b78e4cb46")}</p>
                          <h3 className="mt-0.5 truncate text-base font-black text-slate-950">{company.companyName}</h3>
                          <p className="mt-1 text-xs font-bold text-slate-500">{[company.companyCode, company.city].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-slate-700">
                        {company.fleetTypes.map((type) => <span key={type} className="rounded-full bg-white px-2.5 py-1">{type}</span>)}
                        {company.rentalCount ? <span className="rounded-full bg-white px-2.5 py-1">{i18nText("ui.literals.k05793976369d")}</span> : null}
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1"><Star size={12} fill="currentColor" className="text-amber-500" />{company.reviewCount ? company.rating.toFixed(1) : i18nText("ui.literals.k6403f2b7eb2a")}</span>
                      </div>
                      <button type="button" onClick={() => { setOpen(false); onViewCompany?.(company.id); }} className="kt-touchable mt-3 h-10 w-full rounded-2xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800">{i18nText("ui.literals.k1248e2f7f2e4")}</button>
                    </article>
                  ))}
                  {error ? (
                    <SearchState title={t("urride.search.errorTitle")} body={error} />
                  ) : loading && companies.length === 0 ? (
                    <SearchState title={t("urride.search.loadingTitle")} body={t("urride.search.loadingBody")} />
                  ) : results.length === 0 && companies.length === 0 && !companyLoading && !companyError ? (
                    <SearchState title={t("urride.search.emptyTitle")} body={t("urride.search.emptyBody")} />
                  ) : results.length ? (
                    results.map((fleet) => (
                      <article key={fleet.id} className="rounded-2xl border border-slate-100 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-slate-950">{fleet.fleetName}</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {fleet.operatorId} - {fleet.displayType} - {fleet.plateNumber}
                            </p>
                          </div>
                          <VerificationBadge status={fleet.verificationStatus} />
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <MapPin size={14} />
                          <span className="truncate">{fleet.currentLocation || fleet.lastKnownLocation}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onViewFleet?.(fleet.id);
                          }}
                          className="kt-touchable mt-3 h-10 w-full rounded-2xl bg-green-600 text-sm font-black text-white hover:bg-green-700"
                        >
                          {t("urride.search.viewProfile")}
                        </button>
                      </article>
                    ))
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>
        </AppPortal>
      ) : null}
    </>
  );
}

function SearchState({ title, body }) {
  useUiLocale();
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center">
      <h3 className="text-sm font-black text-slate-950">{translateUi(title)}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">{body}</p>
    </div>
  );
}
