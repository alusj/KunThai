import { useEffect, useState } from "react";

import BusinessSellerEntryAnimation from "./BusinessSellerEntryAnimation";
import NearbyAreaScreen from "../../../../transport/NearbyAreaScreen";
import { useSellerRegistration } from "../../../../../Backend/hooks/useSellerRegistration";
import { StepSlideTransition } from "../../../../shared/motion";
import { useDirectionalStep } from "../../../../shared/motionHooks";
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

export default function BusinessRegistration({ onComplete, onExit }) {
  const [showIntro, setShowIntro] = useState(true);
  const [acceptedCaution, setAcceptedCaution] = useState(false);
  const [leavingCaution, setLeavingCaution] = useState(false);
  const registration = useSellerRegistration({ onComplete });
  const [saveCheckpointOpen, setSaveCheckpointOpen] = useState(false);
  const [locationPickerMode, setLocationPickerMode] = useState(null);
  const stepSlideDirection = useDirectionalStep(registration.step);

  const enhancedRegistration = {
    ...registration,
    openCurrentLocationPicker() {
      registration.closeLocationPrompt();
      setLocationPickerMode("current");
    },
    openDropPinPicker() {
      registration.closeLocationPrompt();
      setLocationPickerMode("dropPin");
    },
  };

  const StepComponent = [
    BusinessIdentityStep,
    LocationContactStep,
    OperationsStep,
    TrustPayoutStep,
    ReviewSubmitStep,
  ][enhancedRegistration.step];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, []);

  function acceptSellerCaution() {
  setLeavingCaution(true);

  window.setTimeout(() => {
    setAcceptedCaution(true);
  }, 520);
}
  if (!acceptedCaution) {
    return (
      <>
        <BusinessSellerEntryAnimation show={showIntro} />

        {!showIntro ? (
         <div className="flex min-h-screen bg-gray-50 px-4 py-6">
  <section
    className={`mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col rounded-[2rem] border border-blue-100 bg-white p-5 shadow-sm transition-all duration-500 ${
      leavingCaution
        ? "translate-y-8 scale-95 opacity-0"
        : "translate-y-0 scale-100 opacity-100"
    }`}
  >
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-blue-700">
        Before you continue
      </p>

      <h1 className="mt-2 text-3xl font-black text-gray-950">
        Welcome to KunThai UrMall Registration
      </h1>

      <p className="mt-8 text-lg font-black text-gray-800">
        Learn about business registration
      </p>

      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
        Set up your business identity, location, operations, trust details,
        and payout information so buyers can discover and contact your store.
      </p>

      <p className="mt-8 text-lg font-black text-gray-800">
        Read our seller policy and guidance
      </p>

      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
        KunThai may use seller information for verification, fraud prevention,
        customer support, order safety, dispute review, and legal compliance.
        KunThai helps connect buyers and sellers, but cannot guarantee physical
        safety, product quality, delivery success, or prevent fraud outside the platform.
      </p>
    </div>

    <div className="mt-auto pt-8">
      <button
        type="button"
        onClick={acceptSellerCaution}
        disabled={leavingCaution}
        className="h-14 w-full rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-70"
      >
        {leavingCaution
          ? "Opening Registration..."
          : "I Have Learned and Accepted the Policy and Guidance"}
      </button>
    </div>
  </section>
</div>
        ) : null}
      </>
    );
  }

  function handleSaveDraft() {
    registration.saveDraft();
    setSaveCheckpointOpen(true);
  }

  function handleSaveAndExit() {
    setSaveCheckpointOpen(false);
    onExit?.();
  }

  if (locationPickerMode) {
    return (
      <div className="kt-explore-stack-enter min-h-screen">
        <NearbyAreaScreen
          mode="businessLocationPicker"
          pickerStart={locationPickerMode}
          backLabel="Back to location form"
          onBack={() => setLocationPickerMode(null)}
          onLocationPicked={(location) => {
            registration.acceptAreaViewLocation(location);
            setLocationPickerMode(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-14">
        <div className="mb-6">
          <p className="text-sm font-black uppercase text-blue-700">
            Seller Registration
          </p>
          <h1 className="mt-1 text-2xl font-black text-gray-950">
            Create your business profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-gray-600">
            Set up the store details that power your seller dashboard, discovery, trust, and payouts.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <main className="space-y-4">
            <RegistrationProgress step={enhancedRegistration.step} />

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-gray-950">
                {STEP_TITLES[enhancedRegistration.step]}
              </h2>

              <div className="mt-5">
                <StepSlideTransition
                  stepKey={enhancedRegistration.step}
                  direction={stepSlideDirection}
                >
                  <StepComponent registration={enhancedRegistration} />
                </StepSlideTransition>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={registration.back}
                disabled={enhancedRegistration.step === 0}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>

              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"
                  >
                    Save Draft
                  </button>

                  {enhancedRegistration.step < 4 ? (
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

                {registration.draftStatus ? (
                  <p className="text-xs font-bold text-blue-700">
                    {registration.draftStatus}
                  </p>
                ) : null}
              </div>
            </div>

            {registration.errors.submit ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {registration.errors.submit}
              </div>
            ) : null}
          </main>

          <LiveBusinessPreview
            form={registration.form}
            readinessScore={registration.readinessScore}
          />
        </div>
      </div>

      {saveCheckpointOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
          <section className="kt-modal-enter w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <p className="text-lg font-black text-gray-950">
              Your information has been saved
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              When you return to UrMall seller registration, you will continue from this same step. Choose Save if you want to leave the form now, or Continue if you want to keep completing it.
            </p>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSaveAndExit}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setSaveCheckpointOpen(false)}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}