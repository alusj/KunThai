import { useEffect, useRef, useState } from "react";

import BusinessSellerEntryAnimation from "./BusinessSellerEntryAnimation";
import NearbyAreaScreen from "../../../../transport/NearbyAreaScreen";
import { useSellerRegistration } from "../../../../../Backend/hooks/useSellerRegistration";
import AppBackTab from "../../../../shared/AppBackTab";
import AccountSetupLoader from "../../../../shared/AccountSetupLoader";
import CenteredModal from "../../../../shared/CenteredModal";
import { ScreenSlideTransition, StepSlideTransition } from "../../../../shared/motion";
import { useDirectionalStep } from "../../../../shared/motionHooks";
import BusinessIdentityStep from "./BusinessIdentityStep";
import BusinessEditSections from "./BusinessEditSections";
import LiveBusinessPreview from "./LiveBusinessPreview";
import LocationContactStep from "./LocationContactStep";
import OperationsStep from "./OperationsStep";
import RegistrationProgress from "./RegistrationProgress";
import ReviewSubmitStep from "./ReviewSubmitStep";
import TrustPayoutStep from "./TrustPayoutStep";
import UrMallCautionCard from "../../../shared/UrMallCautionCard";
import { useI18n, t } from "../../../../../i18n";

const STEP_TITLE_KEYS = [
  "stepIdentity",
  "stepLocation",
  "stepOperations",
  "stepVerification",
  "stepReview",
];

export default function BusinessRegistration({ mode = "create", onComplete, onExit }) {
  useI18n();
  const editing = mode === "edit";
  const [showIntro, setShowIntro] = useState(!editing);
  const [acceptedCaution, setAcceptedCaution] = useState(editing);
  const [leavingCaution, setLeavingCaution] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState({ x: "50%", y: "70%" });
  const transitionOriginRef = useRef(transitionOrigin);
  const registration = useSellerRegistration({ mode, onComplete: completeSellerRegistration });
  const [saveCheckpointOpen, setSaveCheckpointOpen] = useState(false);
  const [locationPickerMode, setLocationPickerMode] = useState(null);
  const stepSlideDirection = useDirectionalStep(registration.step);

  function completeSellerRegistration(business) {
    if (editing) {
      onComplete?.(business);
      return;
    }

    const origin = transitionOriginRef.current;
    setFinishing(true);
    window.setTimeout(() => onComplete?.(business, origin), 480);
  }

  function submitRegistration(event) {
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const origin = buttonRect
      ? { x: `${buttonRect.left + buttonRect.width / 2}px`, y: `${buttonRect.top + buttonRect.height / 2}px` }
      : { x: "50%", y: "70%" };

    transitionOriginRef.current = origin;
    setTransitionOrigin(origin);
    registration.submit();
  }

  function handleRegistrationBack() {
    // Edit mode is a single accordion screen, so Back always leaves to the
    // dashboard rather than walking wizard steps.
    if (!editing && registration.step > 0) {
      registration.back();
      return;
    }

    if (!editing && acceptedCaution) {
      setAcceptedCaution(false);
      return;
    }

    onExit?.();
  }

  const enhancedRegistration = {
    ...registration,
    openCurrentLocationPicker() {
      registration.closeLocationPrompt();
      setLocationPickerMode("current");
    },
    // Accepts "main" or a branch index so the picked pin lands on the right
    // address row; calls without a target keep whatever address was targeted.
    openDropPinPicker(target) {
      registration.closeLocationPrompt();
      if (target === "main" || typeof target === "number") {
        registration.targetLocation(target);
      }
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
    if (editing) return undefined;

    const timer = window.setTimeout(() => {
      setShowIntro(false);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [editing]);

  useEffect(() => {
    if (acceptedCaution) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [acceptedCaution]);

  function acceptSellerCaution() {
    setLeavingCaution(true);

    window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      setAcceptedCaution(true);
      setLeavingCaution(false);
    }, 120);
  }
  if (!acceptedCaution) {
    return (
      <>
        <BusinessSellerEntryAnimation show={showIntro} />

        {!showIntro ? (
          <ScreenSlideTransition screenKey="seller-registration-caution" className="min-h-dvh bg-gray-50">
            <div className="flex min-h-dvh px-4 py-4 sm:py-6">
              <section
                className={`mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col rounded-[2rem] border border-blue-100 bg-white p-5 shadow-sm transition-all duration-300 sm:min-h-[calc(100dvh-3rem)] ${
                  leavingCaution
                    ? "-translate-x-10 opacity-0"
                    : "translate-x-0 opacity-100"
                }`}
              >
                <div>
                  <div className="mb-5">
                    <AppBackTab
                      onBack={onExit}
                      label={t("urmall.biz.reg.backToUrmall")}
                      historyKey="seller-registration-caution"
                      className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
                    />
                  </div>

                  <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                    {t("urmall.biz.reg.beforeContinue")}
                  </p>

                  <h1 className="mt-2 text-3xl font-black text-gray-950">
                    {t("urmall.biz.reg.welcomeTitle")}
                  </h1>

                  <UrMallCautionCard />
                </div>

                <div className="mt-auto pt-8">
                  <button
                    type="button"
                    onClick={acceptSellerCaution}
                    disabled={leavingCaution}
                    className="h-14 w-full rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-70"
                  >
                    {leavingCaution
                      ? t("urmall.biz.reg.opening")
                      : t("urmall.biz.reg.acceptPolicy")}
                  </button>
                </div>
              </section>
            </div>
          </ScreenSlideTransition>
        ) : null}
      </>
    );
  }

  function handleSaveDraft() {
    if (editing) return;
    registration.saveDraft();
    setSaveCheckpointOpen(true);
  }

  function handleSaveAndExit() {
    setSaveCheckpointOpen(false);
    onExit?.();
  }

  if (locationPickerMode) {
    return (
      <div className="kt-explore-stack-enter min-h-dvh">
        <NearbyAreaScreen
          mode="businessLocationPicker"
          pickerStart={locationPickerMode}
          backLabel={t("urmall.biz.reg.backToLocationForm")}
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
    <ScreenSlideTransition
      screenKey={editing ? "seller-business-editor" : "seller-registration-form"}
      className={`${finishing ? "kt-onboarding-collapse-out" : ""} min-h-dvh bg-gray-50`}
      style={{ "--kt-transition-x": transitionOrigin.x, "--kt-transition-y": transitionOrigin.y }}
    >
      <AccountSetupLoader open={!editing && (registration.submitting || finishing)} sector="urmall" />
      <div className="w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-14">
        <div className="mb-6 flex items-start gap-3">
          <AppBackTab
            onBack={handleRegistrationBack}
            label={editing ? t("urmall.biz.reg.backPrevScreen") : registration.step > 0 ? t("urmall.biz.reg.backPrevStep") : t("urmall.biz.reg.backToGuidance")}
            historyKey={editing ? "seller-business-editor" : "seller-registration-form"}
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0">
            <p className="text-sm font-black uppercase text-blue-700">
              {editing ? t("urmall.biz.reg.editorEyebrow") : t("urmall.biz.reg.regEyebrow")}
            </p>
            <h1 className="mt-1 text-2xl font-black text-gray-950">
              {editing ? t("urmall.biz.reg.editTitle") : t("urmall.biz.reg.createTitle")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-gray-600">
              {editing
                ? t("urmall.biz.reg.editSubtitle")
                : t("urmall.biz.reg.createSubtitle")}
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          {editing ? (
            <BusinessEditSections registration={enhancedRegistration} />
          ) : (
          <main className="space-y-4">
            <RegistrationProgress step={enhancedRegistration.step} />

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-gray-950">
                {t(`urmall.biz.reg.${STEP_TITLE_KEYS[enhancedRegistration.step]}`)}
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
                {t("common.back")}
              </button>

              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap justify-end gap-3">
                  {!editing ? (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"
                    >
                      {t("urmall.biz.reg.saveDraft")}
                    </button>
                  ) : null}

                  {enhancedRegistration.step < 4 ? (
                    <button
                      type="button"
                      onClick={registration.next}
                      className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                    >
                      {t("urmall.biz.reg.continue")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submitRegistration}
                      disabled={registration.submitting}
                      className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {registration.submitting ? (editing ? t("urmall.biz.reg.saving") : t("urmall.biz.reg.submitting")) : editing ? t("urmall.biz.reg.saveChanges") : t("urmall.biz.reg.submitBusiness")}
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
          )}

          <LiveBusinessPreview
            form={registration.form}
            readinessScore={registration.readinessScore}
          />
        </div>
      </div>

      <CenteredModal open={saveCheckpointOpen} onClose={() => setSaveCheckpointOpen(false)} maxWidth="max-w-lg" labelledBy="biz-save-title">
        <p id="biz-save-title" className="text-lg font-black text-gray-950">
          {t("urmall.biz.reg.savedTitle")}
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
          {t("urmall.biz.reg.savedBody")}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleSaveAndExit}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-100"
          >
            {t("urmall.biz.reg.save")}
          </button>
          <button
            type="button"
            onClick={() => setSaveCheckpointOpen(false)}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
          >
            {t("urmall.biz.reg.continue")}
          </button>
        </div>
      </CenteredModal>
    </ScreenSlideTransition>
  );
}
