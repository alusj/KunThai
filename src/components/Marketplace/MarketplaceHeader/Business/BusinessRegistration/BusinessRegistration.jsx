import { useSellerRegistration } from "../../../../../Backend/hooks/useSellerRegistration";
import BusinessIdentityStep from "./BusinessIdentityStep";
import LiveBusinessPreview from "./LiveBusinessPreview";
import LocationContactStep from "./LocationContactStep";
import OperationsStep from "./OperationsStep";
import RegistrationProgress from "./RegistrationProgress";
import ReviewSubmitStep from "./ReviewSubmitStep";
import TrustPayoutStep from "./TrustPayoutStep";

const STEP_TITLES = [
  "Business identity",
  "Location and contact",
  "Business operations",
  "Trust and payouts",
  "Review and submit",
];

export default function BusinessRegistration({ onComplete }) {
  const registration = useSellerRegistration({ onComplete });
  const StepComponent = [
    BusinessIdentityStep,
    LocationContactStep,
    OperationsStep,
    TrustPayoutStep,
    ReviewSubmitStep,
  ][registration.step];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-black uppercase text-blue-700">Seller Registration</p>
          <h1 className="mt-1 text-2xl font-black text-gray-950">Create your business profile</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-gray-600">
            Set up the store details that power your seller dashboard, discovery, trust, and payouts.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            <RegistrationProgress step={registration.step} />

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-gray-950">{STEP_TITLES[registration.step]}</h2>
              <div className="mt-5">
                <StepComponent registration={registration} />
              </div>
            </section>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={registration.back}
                disabled={registration.step === 0}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-black text-gray-700 disabled:opacity-40"
              >
                Back
              </button>
              {registration.step < 4 ? (
                <button
                  type="button"
                  onClick={registration.next}
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={registration.submit}
                  disabled={registration.submitting}
                  className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {registration.submitting ? "Submitting..." : "Submit Business"}
                </button>
              )}
            </div>
            {registration.errors.submit ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {registration.errors.submit}
              </div>
            ) : null}
          </main>

          <LiveBusinessPreview form={registration.form} readinessScore={registration.readinessScore} />
        </div>
      </div>
    </div>
  );
}
