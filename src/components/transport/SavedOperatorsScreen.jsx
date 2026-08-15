import { createElement, useEffect, useRef, useState } from "react";
import { FiClock, FiMapPin, FiStar, FiTrash2 } from "react-icons/fi";
import { fetchSavedOperators, getSavedOperators } from "../services/passengerTransportService";
import AppBackTab from "../shared/AppBackTab";
import VerificationBadge from "./verification/VerificationBadge";
import { useI18n, t } from "../../i18n";

export default function SavedOperatorsScreen({ onBack, onViewFleet, onShowVerification, onOpenBooking }) {
  useI18n();
  const initialSavedOperators = getSavedOperators();
  const [savedOperators, setSavedOperators] = useState(() => initialSavedOperators);
  const [loading, setLoading] = useState(() => initialSavedOperators.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const savedOperatorsRef = useRef(savedOperators);

  useEffect(() => {
    savedOperatorsRef.current = savedOperators;
  }, [savedOperators]);

  useEffect(() => {
    let alive = true;
    const localSavedOperators = getSavedOperators();
    const hasExistingSavedOperators = savedOperatorsRef.current.length > 0 || localSavedOperators.length > 0;

    if (localSavedOperators.length) {
      setSavedOperators(localSavedOperators);
      savedOperatorsRef.current = localSavedOperators;
    }
    if (hasExistingSavedOperators) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }
    setError("");

    fetchSavedOperators()
      .then((items) => {
        if (alive) setSavedOperators(items);
      })
      .catch((err) => {
        if (alive) {
          setError(hasExistingSavedOperators ? "" : err.message || t("urride.saved.loadError"));
          if (!hasExistingSavedOperators) {
            setSavedOperators([]);
          }
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="kt-mobile-viewport kt-safe-screen bg-gray-50" data-back-swipe-scope>
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label={t("urride.saved.back")}
            historyKey="transport-saved-operators"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-gray-950">{t("urride.saved.title")}</h1>
            <p className="truncate text-xs text-gray-500">{t("urride.saved.subtitle")}</p>
          </div>
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
            {t("urride.saved.savedCount", { count: savedOperators.length })}
          </span>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
        {refreshing && savedOperators.length ? (
          <p className="mb-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
            {t("urride.saved.refreshing")}
          </p>
        ) : null}
        {error ? (
          <EmptyState title={t("urride.saved.loadErrorTitle")} body={error} />
        ) : loading && !savedOperators.length ? (
          <EmptyState title={t("urride.saved.loadingTitle")} body={t("urride.saved.loadingBody")} />
        ) : savedOperators.length === 0 ? (
          <EmptyState title={t("urride.saved.emptyTitle")} body={t("urride.saved.emptyBody")} />
        ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {savedOperators.map((saved) => (
            <article key={saved.id} className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_minmax(240px,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">{saved.savedAs}</p>
                <h2 className="mt-1 truncate text-base font-black text-gray-950">{saved.fleet?.fleetName}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {saved.fleet?.operatorId} - {saved.fleet?.displayType} - {saved.fleet?.plateNumber}
                </p>
                <div className="mt-3">
                  <VerificationBadge
                    status={saved.fleet?.verificationStatus}
                    onClick={() => onShowVerification(saved.fleet)}
                  />
                </div>
              </div>

              <div className="grid gap-2 text-sm text-gray-600">
                <InfoLine icon={FiClock} text={saved.lastUsed} />
                <InfoLine
                  icon={FiMapPin}
                  text={saved.fleet?.activeStatus === "active" ? saved.fleet.currentLocation : t("urride.saved.lastSeen", { location: saved.fleet?.lastKnownLocation })}
                />
                <InfoLine icon={FiStar} text={t("urride.saved.ratingTrips", { rating: saved.fleet?.rating || t("urride.saved.ratingNew"), trips: saved.fleet?.trips })} />
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <button
                  type="button"
                  onClick={() => onOpenBooking?.({
                    fleet: saved.fleet,
                    selection: {
                      mode: saved.fleet?.serviceCategory === "Delivery" ? "delivery" : "ride",
                      fleetType: saved.fleet?.fleetType,
                      label: saved.fleet?.displayType,
                    },
                  })}
                  disabled={saved.fleet?.activeStatus !== "active"}
                  className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {saved.fleet?.activeStatus === "active" ? t("urride.saved.bookAgain") : t("urride.saved.offline")}
                </button>
                <button
                  type="button"
                  onClick={() => onViewFleet(saved.fleetId)}
                  className="h-10 rounded-2xl border border-gray-200 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  {t("urride.saved.viewProfile")}
                </button>
                <button type="button" className="flex items-center justify-center gap-2 text-sm font-bold text-red-600">
                  <FiTrash2 size={15} />
                  {t("urride.saved.remove")}
                </button>
              </div>
            </article>
          ))}
        </div>
        )}
      </main>
    </div>
  );
}

function InfoLine({ icon, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {createElement(icon, { size: 15, className: "shrink-0 text-gray-500" })}
      <span className="truncate">{text}</span>
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
      <h2 className="text-base font-black text-gray-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold text-gray-500">{body}</p>
    </div>
  );
}
