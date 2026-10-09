import { useEffect, useRef } from "react";

import { isConnectionFailure, shortErrorToast } from "../../Backend/services/friendlyErrorService";
import { showToast } from "../../Backend/services/toastService";
import { REGISTRATION_KINDS, unfinishedRecords } from "../../Backend/services/registration/registrationTaskCore";
import {
  clearRegistrationTask,
  forgetPendingRegistrationRecord,
  getPendingRegistrationRecords,
  getRegistrationTask,
  setRegistrationUserId,
  subscribeRegistrationTasks,
} from "../../Backend/services/registration/registrationTaskRunner";
import { openRegisteredAccount, reviewRegistration } from "../../Backend/services/registration/registrationNavigation";
import { t, useI18n } from "../../i18n";

// Reports registrations that finish while their saving screen is closed, and
// — on launch — registrations a reload or a closed app cut short. Renders
// nothing itself; everything is a toast with an action.

// Long enough to read and reach the button; shown above other overlays.
const TOAST_OPTIONS = { duration: 8000, origin: false, elevated: true };

function showCreatedToast(kind, result) {
  const action = { actionLabel: t("registrationSaving.viewAccount"), onAction: () => openRegisteredAccount(kind, result) };
  if (kind === REGISTRATION_KINDS.URMALL) {
    showToast(t("registrationSaving.toastDoneUrmall"), "success", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrmall") });
  } else if (kind === REGISTRATION_KINDS.URRIDE_SOLO) {
    showToast(t("registrationSaving.toastDoneSolo"), "success", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrride") });
  } else {
    showToast(t("registrationSaving.toastDoneCompany"), "success", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleFleetHq") });
  }
}

// The reason, when it fits a toast; the full one waits on the reopened form.
// A lost connection keeps this toast (with Review) instead of handing over to
// the global offline notice.
function showFailedToast(kind, error) {
  const action = { actionLabel: t("registrationSaving.review"), onAction: () => reviewRegistration(kind) };
  if (kind === REGISTRATION_KINDS.URMALL) {
    showToast(
      isConnectionFailure(error) ? t("registrationSaving.toastFailed") : shortErrorToast(error, t("registrationSaving.toastFailed")),
      "danger",
      { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrmall") },
    );
  } else if (kind === REGISTRATION_KINDS.URRIDE_SOLO) {
    showToast(
      isConnectionFailure(error) ? t("registrationSaving.toastFailed") : shortErrorToast(error, t("registrationSaving.toastFailed")),
      "danger",
      { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrride") },
    );
  } else {
    showToast(
      isConnectionFailure(error) ? t("registrationSaving.toastFailed") : shortErrorToast(error, t("registrationSaving.toastFailed")),
      "danger",
      { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleFleetHq") },
    );
  }
}

function showUnfinishedToast(kind) {
  const action = { actionLabel: t("registrationSaving.review"), onAction: () => reviewRegistration(kind, { interrupted: true }) };
  if (kind === REGISTRATION_KINDS.URMALL) {
    showToast(t("registrationSaving.toastUnfinished"), "warning", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrmall") });
  } else if (kind === REGISTRATION_KINDS.URRIDE_SOLO) {
    showToast(t("registrationSaving.toastUnfinished"), "warning", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrride") });
  } else {
    showToast(t("registrationSaving.toastUnfinished"), "warning", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleFleetHq") });
  }
}

function showPartialToast(kind, result) {
  const action = { actionLabel: t("registrationSaving.viewAccount"), onAction: () => openRegisteredAccount(kind, result) };
  if (kind === REGISTRATION_KINDS.URMALL) {
    showToast(t("registrationSaving.toastPartialUrmall"), "warning", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleUrmall") });
  } else {
    showToast(t("registrationSaving.toastPartialCompany"), "warning", { ...TOAST_OPTIONS, ...action, title: t("registrationSaving.toastTitleFleetHq") });
  }
}

export default function RegistrationBackgroundHost({ userId = "" }) {
  useI18n();
  const checkingRef = useRef(false);

  useEffect(() => {
    setRegistrationUserId(userId);
  }, [userId]);

  // A save that settles with no saving screen open is reported here.
  useEffect(() => subscribeRegistrationTasks((task, change) => {
    if (change !== "settled" || task.handledBy !== "background") return;
    if (task.userId && userId && task.userId !== userId) return;
    if (task.status === "succeeded") {
      clearRegistrationTask(task.kind, task.id);
      showCreatedToast(task.kind, task.result);
    } else {
      // Kept: reopening the registration brings the details back.
      showFailedToast(task.kind, task.error);
    }
  }), [userId]);

  // On launch: a save that never reported back was cut short. Ask the server
  // what happened and say so — never resubmit on the user's behalf.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    async function checkInterrupted() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const { checkInterruptedRegistration } = await import("../../Backend/services/registration/registrationRecovery");
        const records = unfinishedRecords(getPendingRegistrationRecords(), userId).filter((record) => {
          const live = getRegistrationTask(record.kind);
          return !(live && live.id === record.taskId);
        });
        for (const record of records) {
          if (cancelled) return;
          let result;
          try {
            result = await checkInterruptedRegistration(record);
          } catch {
            // Offline or the server is unreachable: ask again later.
            continue;
          }
          if (cancelled) return;
          forgetPendingRegistrationRecord(record);
          if (result.outcome === "completed") showCreatedToast(record.kind, { id: result.id });
          else if (result.outcome === "partial") showPartialToast(record.kind, { id: result.id });
          else showUnfinishedToast(record.kind);
        }
      } finally {
        checkingRef.current = false;
      }
    }

    // Let the app finish opening first so the toast is not lost behind it.
    const timer = window.setTimeout(checkInterrupted, 2500);
    window.addEventListener("online", checkInterrupted);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", checkInterrupted);
    };
  }, [userId]);

  return null;
}
