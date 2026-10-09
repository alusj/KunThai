// Where the toasts of a background registration lead.
//
// "View account" opens what was just created — the UrMall business
// dashboard, the UrRide operator dashboard or the company's Fleet HQ — using
// the same deep links notifications use. "Review" reopens the registration;
// its screen brings the entered details back (from memory after a failure,
// or from the draft kept at submit time after the app was closed).

import { requestMarketplaceScreen } from "../notificationBannerService";
import { REGISTRATION_KINDS } from "./registrationTaskCore.js";
import { markRegistrationRecoveryNotice } from "./registrationTaskRunner.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function openTransport(target) {
  window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "transport", target } }));
}

export async function openRegisteredAccount(kind, result = null) {
  if (kind === REGISTRATION_KINDS.URMALL) {
    // The new business is already the active one (the save selected it).
    requestMarketplaceScreen("business");
    return;
  }

  if (kind === REGISTRATION_KINDS.URRIDE_SOLO) {
    openTransport("urride:operator-dashboard");
    return;
  }

  const companyId = UUID_PATTERN.test(String(result?.id || "")) ? result.id : "";
  if (companyId) {
    const { setActiveTransportCompanyId } = await import("../../../components/services/transportCompanyService");
    await setActiveTransportCompanyId(companyId).catch(() => {});
  }
  openTransport(companyId ? `urride:company-dashboard:${companyId}` : "urride:company-dashboard");
}

export async function reviewRegistration(kind, { interrupted = false } = {}) {
  if (interrupted) markRegistrationRecoveryNotice(kind);

  if (kind === REGISTRATION_KINDS.URMALL) {
    // A first business is registered from UrMall's business screen itself;
    // another one from its "Add business" screen.
    const { readRegisteredBusinesses } = await import("../marketplace/sellerRegistrationService");
    const businesses = await readRegisteredBusinesses({ fresh: true }).catch(() => []);
    requestMarketplaceScreen(businesses.length ? "business-register" : "business");
    return;
  }

  openTransport(kind === REGISTRATION_KINDS.URRIDE_SOLO ? "urride:register-solo" : "urride:register-company");
}
