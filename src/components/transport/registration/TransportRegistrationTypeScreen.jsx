import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";

import AppBackTab from "../../shared/AppBackTab";
import { ScreenSlideTransition } from "../../shared/motion";
import TransportEntryAnimation from "./TransportEntryAnimation";

const OPTIONS = [
  {
    id: "solo",
    title: "Solo Operator",
    subtitle: "Register yourself and one primary fleet.",
    icon: UserRound,
    bullets: ["Personal operator profile", "One fleet registration", "Direct passenger bookings"],
  },
  {
    id: "company",
    title: "Company / Organization",
    subtitle: "Register a transport business, add fleets, and invite operators.",
    icon: Building2,
    bullets: ["Fleet HQ workspace", "Multiple fleet documents", "Operator invites by KunThai ID"],
  },
];

export default function TransportRegistrationTypeScreen({ onBack, onSelect }) {
  const [showIntro, setShowIntro] = useState(true);
  const [selectedType, setSelectedType] = useState(null);
  const [leavingCaution, setLeavingCaution] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, []);

  function handleSelect(type) {
    setSelectedType(type);
    setLeavingCaution(false);
  }

  function continueToRegistration() {
    if (!selectedType) return;

    setShowIntro(true);

    window.setTimeout(() => {
      onSelect(selectedType);
    }, 1800);
  }

  function acceptTransportCaution() {
    setLeavingCaution(true);

    window.setTimeout(() => {
      continueToRegistration();
    }, 300);
  }

  if (selectedType) {
    const isCompany = selectedType === "company";
    const title = isCompany ? "Company / Organization" : "Solo Operator";

    return (
      <>
        <TransportEntryAnimation show={showIntro} />

        <ScreenSlideTransition screenKey="transport-registration-policy" className="min-h-dvh bg-slate-50">
          <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
            <div className="flex items-center gap-3">
              <AppBackTab
                onBack={() => setSelectedType(null)}
                label="Back to registration type"
                historyKey="transport-registration-policy"
                className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
              />

              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  Before you continue
                </p>
                <h1 className="truncate text-xl font-black text-slate-950">
                  Welcome to {title}
                </h1>
              </div>
            </div>
          </header>

          <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-4xl px-4 py-4 pb-6">
            <section
              className={`mx-auto flex min-h-full w-full max-w-3xl flex-col rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm transition-all duration-300 ${
                leavingCaution
                  ? "-translate-x-10 opacity-0"
                  : "translate-x-0 opacity-100"
              }`}
            >
              <div>
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck size={32} />
                </div>

                <h2 className="mt-5 text-3xl font-black text-slate-950">
                  Welcome to {title}
                </h2>

                <p className="mt-8 text-lg font-black text-slate-800">
                  Learn about {title} registration
                </p>

                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Understand how registration works, what information is required,
                  what KunThai Transport can provide, and the responsibilities of
                  operators, companies, and fleet owners.
                </p>

                <p className="mt-8 text-lg font-black text-slate-800">
                  Read our policy and guidance
                </p>

                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  KunThai may assist with bookings, route records, emergency reporting,
                  account verification, fraud prevention, and lawful information requests.
                  KunThai is a technology platform and cannot physically guarantee safety,
                  prevent crime, or replace emergency services.
                </p>

                <div className="mt-5 grid gap-3">
                  <PolicyItem
                    title="Registration accuracy"
                    body="Use your real name, active phone number, correct vehicle or fleet details, and valid documents. False information may delay approval or lead to account restriction."
                  />

                  <PolicyItem
                    title="Safety responsibility"
                    body="KunThai can provide tools, route guidance, booking records, contact details, reporting channels, and emergency information. However, KunThai cannot physically prevent danger, accidents, criminal activity, unsafe driving, or misconduct in the real world."
                  />

                  <PolicyItem
                    title="Verification and review"
                    body="Your registration may be reviewed before full access is granted. We may request documents, photos, location details, or additional checks to protect passengers, operators, companies, and the platform."
                  />

                  <PolicyItem
                    title="Information sharing"
                    body="KunThai may share necessary trip, operator, passenger, fleet, location, payment, or account information when required by law, court order, verified government request, emergency investigation, fraud review, or serious safety incident."
                  />

                  <PolicyItem
                    title="Platform limitation"
                    body="KunThai is a technology platform. We guide, connect, inform, and support users, but we are not a police service, ambulance service, insurance company, or physical security provider."
                  />

                  <PolicyItem
                    title="Professional conduct"
                    body="Operators and companies must treat passengers respectfully, avoid unsafe driving, follow local transport laws, protect customer privacy, and never misuse passenger information."
                  />
                </div>
              </div>

              <div className="mt-auto pt-8">
                <button
                  type="button"
                  onClick={acceptTransportCaution}
                  disabled={leavingCaution}
                  className="h-14 w-full rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-70"
                >
                  {leavingCaution
                    ? "Opening Registration..."
                    : "I Have Learned and Accepted the Policy and Guidance"}
                </button>
              </div>
            </section>
          </main>
        </ScreenSlideTransition>
      </>
    );
  }

  return (
    <>
      <TransportEntryAnimation show={showIntro} />

      <ScreenSlideTransition screenKey="transport-registration-type" className="min-h-dvh bg-slate-50">
        <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <AppBackTab
              onBack={onBack}
              label="Back to transport"
              historyKey="transport-registration-type"
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
            />

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                Transport registration
              </p>
              <h1 className="truncate text-xl font-black text-slate-950">
                Choose your registration type
              </h1>
            </div>
          </div>
        </header>

        <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Truck size={28} />
            </div>

            <p className="mt-4 text-xs font-black uppercase tracking-wide text-emerald-700">
              KunThai Transport
            </p>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Register operators, fleets, and transport companies.
            </h2>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Choose the right setup for your transport account.
            </p>
          </section>

          <section className="grid gap-4">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const isCompany = option.id === "company";

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={`kt-pressable rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                    isCompany
                      ? "border-blue-200 hover:border-blue-400"
                      : "border-emerald-200 hover:border-emerald-400"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                        isCompany
                          ? "bg-blue-50 text-blue-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <Icon size={28} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-xl font-black text-slate-950">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-sm font-semibold leading-6 text-slate-600">
                        {option.subtitle}
                      </span>
                    </span>

                    <CheckCircle2
                      className={isCompany ? "text-blue-600" : "text-emerald-600"}
                      size={24}
                    />
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {option.bullets.map((bullet) => (
                      <span
                        key={bullet}
                        className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600"
                      >
                        {bullet}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </section>
        </main>
      </ScreenSlideTransition>
    </>
  );
}

function PolicyItem({ title, body }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        {body}
      </p>
    </div>
  );
}
