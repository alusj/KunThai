import { inlineErrorMessage, shortErrorToast } from "../../../../Backend/services/friendlyErrorService";
import { showToast } from "../../../../Backend/services/toastService";

// Shows the toast for a failed profile/Space save and returns the inline
// message to show under the form.
export function notifyProfileSaveError(error, { isSpace = false, t }) {
  switch (error?.code) {
    case "username-taken":
      showToast(t("exploreProfileFix.usernameTaken"), "danger");
      return t("exploreProfileFix.usernameTakenMsg");
    case "username-length":
    case "username-leadingDot":
    case "username-characters":
      showToast(t("exploreProfileFix.usernameInvalid"), "danger");
      return t("exploreProfileFix.usernameRules");
    case "display-name-required":
      showToast(t("exploreProfileFix.displayNameRequired"), "danger");
      return t("exploreProfileFix.displayNameRequiredMsg");
    case "name-required":
      showToast(t("exploreProfileFix.displayNameRequired"), "danger");
      return t("exploreProfileFix.spaceNameRequiredMsg");
    case "slug-taken":
      showToast(t("exploreProfileFix.handleTaken"), "danger");
      return t("exploreProfileFix.spaceHandleTakenMsg");
    case "slug-invalid":
      showToast(t("exploreProfileFix.handleInvalid"), "danger");
      return t("exploreProfileFix.spaceHandleRules");
    default:
      if (isSpace) showToast(shortErrorToast(error, "Space wasn't saved"), "danger");
      else showToast(shortErrorToast(error, "Profile wasn't saved"), "danger");
      return inlineErrorMessage(error, t("profile.unableUpdateProfile"));
  }
}

// After a save that went through: a photo that failed to upload kept the
// previous one. Returns the inline message, or "" when both uploads worked.
export function notifyProfileUploadProblems(updated = {}, { t }) {
  if (updated.avatarUploadFailed) {
    showToast(t("exploreProfileFix.photoNotUploaded"), "danger");
    return t("exploreProfileFix.avatarUploadFailedMsg");
  }
  if (updated.coverUploadFailed) {
    showToast(t("exploreProfileFix.coverNotUploaded"), "danger");
    return t("exploreProfileFix.coverUploadFailedMsg");
  }
  return "";
}
