import { useCallback, useEffect, useRef, useState } from "react";
import { FiBriefcase, FiCheckCircle, FiFileText, FiShield, FiX } from "react-icons/fi";

import Body from "./Body/Body";
import ActiveTripsScreen from "./ActiveTripsScreen";
import FleetListScreen from "./FleetListScreen";
import FleetProfileScreen from "./FleetProfileScreen";
import NearbyAreaScreen from "./NearbyAreaScreen";
import OperatorDashboardScreen from "./OperatorDashboardScreen";
import SavedOperatorsScreen from "./SavedOperatorsScreen";
import TransportBookingDrawer from "./booking/TransportBookingDrawer";
import CompanyWorkspaceScreen from "./CompanyWorkspaceScreen";
import Header from "./header/Header";
import CompanyRegistrationScreen from "./registration/CompanyRegistrationScreen";
import FleetRegistrationDrawer from "./registration/FleetRegistrationDrawer";
import TransportRegistrationTypeScreen from "./registration/TransportRegistrationTypeScreen";
import VerificationDetailsModal from "./verification/VerificationDetailsModal";
import PassengerLiveTripHeaderCard from "./live/PassengerLiveTripHeaderCard";
import AppBackTab from "../shared/AppBackTab";
import { fetchOperatorDashboard, getOperatorAccount } from "../services/transportOperatorAccountService";
import {
  getOperatorCompanyInvites,
  getTransportCompanyAccount,
  subscribeTransportCompanyUpdates,
  submitOperatorCompanyInviteDocuments,
  updateOperatorCompanyInvite,
} from "../services/transportCompanyService";
import { submitTransportSupportTicket } from "../services/bookingService";
import { showToast } from "../../Backend/services/toastService";

export default function Transport({ onActivityChange, areaViewRequest = null }) {
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationType, setRegistrationType] = useState(null);
  const [registrationSource, setRegistrationSource] = useState(null);
  const [registrationAreaPreviewOpen, setRegistrationAreaPreviewOpen] = useState(false);
  const [operatorAccount, setOperatorAccount] = useState(null);
  const [operatorLoading, setOperatorLoading] = useState(true);
  const [operatorError, setOperatorError] = useState("");
  const [companyAccount, setCompanyAccount] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyWorkspaceOpen, setCompanyWorkspaceOpen] = useState(false);
  const [companyWorkspaceStatus, setCompanyWorkspaceStatus] = useState("");
  const [companyOperatorDashboardOpen, setCompanyOperatorDashboardOpen] = useState(false);
  const [companyOperatorAccount, setCompanyOperatorAccount] = useState(null);
  const [operatorDashboardOpen, setOperatorDashboardOpen] = useState(false);
  const [operatorDashboardClosing, setOperatorDashboardClosing] = useState(false);
  const [operatorDashboardView, setOperatorDashboardView] = useState("dashboard");
  const [fleetSelection, setFleetSelection] = useState(null);
  const [activeFleetId, setActiveFleetId] = useState(null);
  const [activeTripsOpen, setActiveTripsOpen] = useState(false);
  const [activeTripsActionRequest, setActiveTripsActionRequest] = useState(null);
  const [nearbyAreaOpen, setNearbyAreaOpen] = useState(false);
  const [nearbyAreaRequest, setNearbyAreaRequest] = useState(null);
  const [savedOperatorsOpen, setSavedOperatorsOpen] = useState(false);
  const [verificationFleet, setVerificationFleet] = useState(null);
  const [bookingTarget, setBookingTarget] = useState(null);
  const [headerActivityOpen, setHeaderActivityOpen] = useState(false);
  const [operatorCompanyInvites, setOperatorCompanyInvites] = useState([]);
  const [operatorInviteLoading, setOperatorInviteLoading] = useState(false);
  const [operatorInviteStatus, setOperatorInviteStatus] = useState("");
  const [documentReuseInvite, setDocumentReuseInvite] = useState(null);
  const [operatorInviteDocumentsInvite, setOperatorInviteDocumentsInvite] = useState(null);
  const [registrationInvite, setRegistrationInvite] = useState(null);
  const [routeDirection, setRouteDirection] = useState("forward");
  const operatorDashboardCloseTimer = useRef(null);
  const operatorCompanyInvitesRef = useRef([]);

  const routePanelClass = routeDirection === "backward" ? "kt-explore-stack-enter-left" : "kt-explore-stack-enter";

  useEffect(() => {
    operatorCompanyInvitesRef.current = operatorCompanyInvites;
  }, [operatorCompanyInvites]);

  function handleBookingCreated() {
    setBookingTarget(null);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsActionRequest(null);
    setNearbyAreaOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    setRouteDirection("forward");
    setActiveTripsOpen(true);
  }

  function openOperatorDashboard(view = "dashboard") {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }

    setOperatorDashboardClosing(false);
    setOperatorDashboardView(view);
    setRouteDirection("forward");
    setCompanyOperatorDashboardOpen(false);
    setCompanyOperatorAccount(null);
    setOperatorDashboardOpen(true);
  }

  function openRegistrationChooser() {
    setRegistrationSource("transport-chooser");
    setRegistrationType(null);
    setRegistrationOpen(true);
    setCompanyWorkspaceOpen(false);
    setCompanyOperatorDashboardOpen(false);
    setCompanyOperatorAccount(null);
    setRouteDirection("forward");
  }

  function openSoloRegistration(source = "transport-chooser") {
    setRegistrationSource(source);
    setRegistrationType("solo");
    setRegistrationOpen(true);
    setCompanyWorkspaceOpen(false);
    setCompanyOperatorDashboardOpen(false);
    setCompanyOperatorAccount(null);
    setRouteDirection("forward");
  }

  function openCompanyRegistration(source = "transport-chooser") {
    setRegistrationSource(source);
    setRegistrationType("company");
    setRegistrationOpen(true);
    setCompanyWorkspaceOpen(false);
    setCompanyOperatorDashboardOpen(false);
    setCompanyOperatorAccount(null);
    setRouteDirection("forward");
  }

  function closeRegistrationFlow() {
    setRouteDirection("backward");

    if (registrationSource === "transport-chooser" && registrationType) {
      setRegistrationType(null);
      return;
    }

    setRegistrationOpen(false);
    setRegistrationType(null);

    if (registrationSource === "operator-dashboard") {
      setOperatorDashboardOpen(true);
    }

    if (registrationSource === "company-workspace") {
      setCompanyWorkspaceOpen(true);
    }

    if (registrationSource === "company-invite") {
      setRegistrationInvite(null);
    }

    setRegistrationSource(null);
  }

  function exitRegistrationFlow() {
    setRouteDirection("backward");
    setRegistrationOpen(false);
    setRegistrationType(null);

    if (registrationSource === "operator-dashboard") {
      setOperatorDashboardOpen(true);
    }

    if (registrationSource === "company-workspace") {
      setCompanyWorkspaceOpen(true);
    }

    if (registrationSource === "company-invite") {
      setRegistrationInvite(null);
    }

    setRegistrationSource(null);
  }

  function closeOperatorDashboard() {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
    }

    setOperatorDashboardClosing(true);
    setRouteDirection("backward");
    operatorDashboardCloseTimer.current = window.setTimeout(() => {
      setOperatorDashboardOpen(false);
      setOperatorDashboardClosing(false);
      operatorDashboardCloseTimer.current = null;
    }, 240);
  }

  function openNearbyAreaRoute(destination = null, options = {}) {
    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }

    setRouteDirection("forward");
    setRegistrationAreaPreviewOpen(false);
    setRegistrationOpen(false);
    setRegistrationType(null);
    setRegistrationSource(null);
    setCompanyWorkspaceOpen(false);
    setCompanyOperatorDashboardOpen(false);
    setCompanyOperatorAccount(null);
    setOperatorDashboardOpen(false);
    setOperatorDashboardClosing(false);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    const returnToBooking = options.returnTo === "booking";
    const returnToExploreMessages = options.returnTo === "explore-messages";
    const bookingSnapshot = returnToBooking ? options.bookingTarget || bookingTarget : null;
    setBookingTarget(null);
    setNearbyAreaRequest(
      destination || Object.keys(options).length
        ? {
            destination,
            autoRoute: options.autoRoute ?? true,
            returnTo: returnToBooking ? "booking" : returnToExploreMessages ? "explore-messages" : "",
            bookingTarget: bookingSnapshot,
          }
        : null,
    );
    setNearbyAreaOpen(true);
  }

  function openRegistrationOneKmPreview() {
    setRouteDirection("forward");
    setRegistrationAreaPreviewOpen(true);
  }

  function closeRegistrationOneKmPreview() {
    setRouteDirection("backward");
    setRegistrationAreaPreviewOpen(false);
  }

  function renderBookingDrawer() {
    return (
      <TransportBookingDrawer
        open={Boolean(bookingTarget)}
        target={bookingTarget}
        onClose={() => setBookingTarget(null)}
        onCreated={handleBookingCreated}
        onLocateArea={openNearbyAreaRoute}
      />
    );
  }

  function handleViewVerificationProfile() {
    if (!verificationFleet?.id) return;
    setRouteDirection("forward");
    setActiveFleetId(verificationFleet.id);
    setFleetSelection(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
  }

  function handleChooseVerifiedOperators() {
    setVerificationFleet(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setRouteDirection("forward");
    setFleetSelection({
      mode: "topRated",
      fleetType: null,
      label: "Verified Operators",
      verifiedOnly: true,
    });
  }

  function handleContinueWithVerification() {
    setVerificationFleet(null);
  }

  function handleBookVerificationFleet() {
    if (!verificationFleet) return;
    setBookingTarget({ fleet: verificationFleet });
  }

  async function handleReportVerificationConcern(fleetOrPayload, maybePayload) {
    const fleet = maybePayload ? fleetOrPayload : verificationFleet;
    const payload = maybePayload || fleetOrPayload || {};

    if (!fleet) {
      throw new Error("Select the operator again so KunThai can attach the correct fleet record.");
    }

    const reason = payload.reason || "Verification concern";
    const message = String(payload.message || "").trim();
    const supportBody = [
      `Reason: ${reason}`,
      `Operator: ${fleet.operatorName || fleet.fleetName || "Transport operator"}`,
      `Fleet: ${fleet.fleetName || "Fleet name unavailable"}`,
      `Fleet ID: ${fleet.id || "Unavailable"}`,
      `Operator record: ${fleet.operatorRecordId || "Unavailable"}`,
      `Display code: ${fleet.operatorId || "Unavailable"}`,
      `Plate: ${fleet.plateNumber || "Unavailable"}`,
      `Verification status: ${fleet.verificationStatus || "Unknown"}`,
      "",
      message,
    ].join("\n");

    return submitTransportSupportTicket({
      fleetId: fleet.id || fleet.operatorRecordId || "",
      topic: "Operator verification concern",
      priority: reason === "Safety concern" ? "high" : "normal",
      body: supportBody,
    });
  }

  const refreshOperatorCompanyInvites = useCallback(async (account = operatorAccount) => {
    try {
      const hasCachedInvites = operatorCompanyInvitesRef.current.length > 0;
      if (!hasCachedInvites) setOperatorInviteLoading(true);
      const invites = await getOperatorCompanyInvites(account);
      setOperatorCompanyInvites((current) => {
        const next = invites.length || !current.length ? invites : current;
        operatorCompanyInvitesRef.current = next;
        return next;
      });
      setOperatorInviteStatus("");
    } catch (error) {
      if (!/sign in/i.test(error.message || "")) {
        setOperatorInviteStatus(error.message || "Unable to load company registration requests.");
      }
    } finally {
      setOperatorInviteLoading(false);
    }
  }, [operatorAccount]);

  async function respondToOperatorInvite(invite, patch) {
    const updatedInvite = await updateOperatorCompanyInvite(invite, {
      operatorId: operatorAccount?.id || invite.operatorId,
      userId: operatorAccount?.userId || invite.userId,
      verificationStatus: operatorAccount?.verificationStatus || invite.verificationStatus,
      ...patch,
    });
    setOperatorCompanyInvites((items) => {
      const next = items.map((item) => (item.requestId === updatedInvite.requestId && item.companyId === updatedInvite.companyId ? updatedInvite : item));
      operatorCompanyInvitesRef.current = next;
      return next;
    });
    return updatedInvite;
  }

  function removeOperatorInvite(invite) {
    if (!invite) return;
    setOperatorCompanyInvites((items) => {
      const next = items.filter((item) => {
        const sameId = invite.id && item.id === invite.id;
        const sameRequest = item.requestId === invite.requestId && item.companyId === invite.companyId;
        return !(sameId || sameRequest);
      });
      operatorCompanyInvitesRef.current = next;
      return next;
    });
  }

  async function acceptOperatorCompanyInvite(invite) {
    setOperatorInviteStatus("");
    if (hasSubmittedOperatorDocuments(operatorAccount)) {
      setDocumentReuseInvite(invite);
      return;
    }

    try {
      const updatedInvite = await respondToOperatorInvite(invite, {
        status: "accepted",
        documents: {
          operatorDocumentsRequired: true,
          operatorDocumentsRequestedAt: new Date().toISOString(),
          registrationRequired: false,
        },
      });
      setOperatorInviteDocumentsInvite(updatedInvite);
    } catch (error) {
      setOperatorInviteStatus(error.message || "Unable to accept this company request.");
    }
  }

  async function continueWithExistingOperatorDocuments() {
    if (!documentReuseInvite) return;
    try {
      const reuseNotice = "KunThai will use the operator identity and license documents you previously submitted for review.";
      await respondToOperatorInvite(documentReuseInvite, {
        status: "accepted",
        documents: {
          reuseNotice,
          reusedExistingDocuments: true,
          reusedAt: new Date().toISOString(),
        },
      });
      setDocumentReuseInvite(null);
      await refreshOperatorCompanyInvites(operatorAccount);
      setOperatorInviteStatus("Company request accepted. KunThai will use your previously submitted operator documents.");
    } catch (error) {
      setOperatorInviteStatus(error.message || "Unable to continue with existing documents.");
    }
  }

  async function rejectOperatorCompanyInvite(invite = documentReuseInvite) {
    if (!invite) return;
    try {
      setOperatorInviteStatus("");
      const rejectedInvite = await respondToOperatorInvite(invite, {
        status: "rejected",
        documents: {
          rejectedAt: new Date().toISOString(),
        },
      });
      removeOperatorInvite(rejectedInvite);
      setDocumentReuseInvite(null);
      showToast("You've rejected this request.", "warning", {
        title: "Request rejected",
        anchor: "notification",
      });
      await refreshOperatorCompanyInvites(operatorAccount);
    } catch (error) {
      setOperatorInviteStatus(error.message || "Unable to decline this company request.");
    }
  }

  async function dismissCompletedOperatorInvite(invite) {
    if (!invite) return;
    try {
      const completedInvite = await respondToOperatorInvite(invite, {
        status: "accepted",
        documents: {
          operatorAcknowledgedAt: new Date().toISOString(),
        },
      });
      removeOperatorInvite(completedInvite);
      setOperatorInviteStatus("");
    } catch (error) {
      setOperatorInviteStatus(error.message || "Unable to dismiss this completed request.");
    }
  }

  function completeRegistrationForInvite(invite) {
    setOperatorInviteDocumentsInvite(invite);
  }

  async function submitOperatorInviteDocuments(invite, documents) {
    if (!invite) return;
    try {
      const savedSubmission = await submitOperatorCompanyInviteDocuments(invite, documents);
      const refreshedAccount = await getOperatorAccount().catch(() => null);
      if (refreshedAccount) setOperatorAccount(refreshedAccount);

      const updatedInvite = await respondToOperatorInvite(invite, {
        status: "accepted",
        operatorId: savedSubmission.operator?.id || refreshedAccount?.id || operatorAccount?.id || invite.operatorId,
        userId: savedSubmission.operator?.user_id || refreshedAccount?.userId || operatorAccount?.userId || invite.userId,
        verificationStatus: refreshedAccount?.verificationStatus || savedSubmission.operator?.verification_status || operatorAccount?.verificationStatus || "pending",
        documents: {
          operatorDocuments: documents,
          operatorDocumentsSubmitted: true,
          operatorDocumentsSubmittedAt: new Date().toISOString(),
          operatorDocumentsSaved: savedSubmission.documents?.length || Object.keys(documents || {}).length,
          operatorDocumentsStorage: savedSubmission.storageMode || "cloud",
          operatorDocumentsWarning: savedSubmission.warning || "",
          operatorProfileId: savedSubmission.operator?.id || refreshedAccount?.id || operatorAccount?.id || "",
          operatorDocumentsRequired: false,
          registrationRequired: false,
        },
      });
      setOperatorInviteDocumentsInvite(null);
      await refreshOperatorCompanyInvites(operatorAccount);
      setOperatorInviteStatus(`${updatedInvite.companyName || "Company"} request accepted. Your operator documents were submitted for review.`);
    } catch (error) {
      throw new Error(error.message || "Unable to submit operator documents for this request.");
    }
  }

  async function finishOperatorRegistration(account) {
    setOperatorAccount(account);
    if (registrationInvite) {
      try {
        await updateOperatorCompanyInvite(registrationInvite, {
          status: "accepted",
          operatorId: account?.id,
          userId: account?.userId,
          verificationStatus: account?.verificationStatus || "pending",
          documents: {
            registrationRequired: false,
            registrationCompleted: true,
            registrationCompletedAt: new Date().toISOString(),
          },
        });
        const invites = await getOperatorCompanyInvites(account).catch(() => []);
        setOperatorCompanyInvites(invites);
      } catch (error) {
        setOperatorInviteStatus(error.message || "Operator registered, but the company request could not be updated.");
      } finally {
        setRegistrationInvite(null);
      }
    }

    setRegistrationOpen(false);
    setRegistrationType(null);
    setRegistrationSource(null);
    setRouteDirection("forward");
    setOperatorDashboardOpen(true);
  }

  async function openCompanyOperatorDashboard(operator) {
    if (!operator?.operatorId) {
      setCompanyWorkspaceStatus("This operator has not completed registration yet, so the dashboard is not available.");
      return;
    }

    try {
      setCompanyWorkspaceStatus("Opening operator dashboard...");
      const dashboard = await fetchOperatorDashboard(operator.operatorId);
      const account = buildReadOnlyOperatorAccount(operator, dashboard);
      setCompanyOperatorAccount(account);
      setCompanyOperatorDashboardOpen(true);
      setCompanyWorkspaceOpen(false);
      setRouteDirection("forward");
      setCompanyWorkspaceStatus("");
    } catch (error) {
      setCompanyWorkspaceStatus(error.message || "Unable to open this operator dashboard.");
    }
  }

  useEffect(() => {
    let alive = true;

    async function loadOperatorAccount() {
      try {
        setOperatorError("");
        const account = await getOperatorAccount();
        if (alive) setOperatorAccount(account);
      } catch (error) {
        if (alive) setOperatorError(error.message || "Unable to load fleet account.");
      } finally {
        if (alive) setOperatorLoading(false);
      }
    }

    loadOperatorAccount();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    refreshOperatorCompanyInvites();
  }, [refreshOperatorCompanyInvites]);

  useEffect(() => {
    const refreshInvites = () => {
      refreshOperatorCompanyInvites(operatorAccount);
    };

    const unsubscribe = subscribeTransportCompanyUpdates(refreshInvites);
    window.addEventListener("storage", refreshInvites);
    return () => {
      unsubscribe?.();
      window.removeEventListener("storage", refreshInvites);
    };
  }, [operatorAccount, refreshOperatorCompanyInvites]);

  useEffect(() => {
    let alive = true;

    async function loadCompanyAccount() {
      try {
        const account = await getTransportCompanyAccount();
        if (alive) setCompanyAccount(account);
      } catch {
        if (alive) setCompanyAccount(null);
      } finally {
        if (alive) setCompanyLoading(false);
      }
    }

    loadCompanyAccount();
    const unsubscribe = subscribeTransportCompanyUpdates(async (account) => {
      if (!alive) return;
      if (account?.companyName || account?.company_name || account?.companyCode || account?.company_code) {
        setCompanyAccount(account || null);
        return;
      }

      const nextAccount = await getTransportCompanyAccount().catch(() => null);
      if (!alive) return;
      setCompanyAccount(nextAccount);

      const inviteUpdate = account?.table === "transport_company_operator_invites" ? account.new : null;
      if (nextAccount?.id && inviteUpdate?.company_id === nextAccount.id) {
        const inviteStatus = String(inviteUpdate.status || "").toLowerCase();
        const inviteDocuments = inviteUpdate.documents || {};
        const operatorName = inviteUpdate.operator_name || "An operator";
        const message = inviteStatus === "rejected"
          ? `${operatorName} declined your company invitation.`
          : inviteStatus === "accepted" && inviteDocuments.operatorDocumentsSubmitted
            ? `${operatorName} accepted and submitted operator documents for review.`
            : inviteStatus === "accepted"
              ? `${operatorName} accepted your company invitation.`
              : "";

        if (message) {
          setCompanyWorkspaceStatus(message);
          showToast(message, inviteStatus === "rejected" ? "warning" : "success", {
            title: inviteStatus === "rejected" ? "Invitation declined" : "Invitation accepted",
          });
        }
      }
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (operatorDashboardCloseTimer.current) {
        window.clearTimeout(operatorDashboardCloseTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!areaViewRequest) return;

    if (operatorDashboardCloseTimer.current) {
      window.clearTimeout(operatorDashboardCloseTimer.current);
      operatorDashboardCloseTimer.current = null;
    }
    setRegistrationOpen(false);
    setRegistrationType(null);
    setRegistrationSource(null);
    setRegistrationAreaPreviewOpen(false);
    setRouteDirection("forward");
    setCompanyWorkspaceOpen(false);
    setCompanyOperatorDashboardOpen(false);
    setCompanyOperatorAccount(null);
    setOperatorDashboardOpen(false);
    setOperatorDashboardClosing(false);
    setFleetSelection(null);
    setActiveFleetId(null);
    setActiveTripsOpen(false);
    setSavedOperatorsOpen(false);
    setVerificationFleet(null);
    setBookingTarget(null);
    setNearbyAreaRequest(areaViewRequest);
    setNearbyAreaOpen(true);
  }, [areaViewRequest]);

  useEffect(() => {
    onActivityChange?.(
      registrationOpen ||
        companyWorkspaceOpen ||
        companyOperatorDashboardOpen ||
        operatorDashboardOpen ||
        Boolean(fleetSelection) ||
        Boolean(activeFleetId) ||
        activeTripsOpen ||
        registrationAreaPreviewOpen ||
        nearbyAreaOpen ||
        savedOperatorsOpen ||
        Boolean(verificationFleet) ||
        Boolean(bookingTarget) ||
        headerActivityOpen ||
        Boolean(documentReuseInvite) ||
        Boolean(operatorInviteDocumentsInvite),
    );

    return () => onActivityChange?.(false);
  }, [
    activeFleetId,
    activeTripsOpen,
    bookingTarget,
    companyWorkspaceOpen,
    companyOperatorDashboardOpen,
    documentReuseInvite,
    fleetSelection,
    headerActivityOpen,
    nearbyAreaOpen,
    onActivityChange,
    operatorInviteDocumentsInvite,
    operatorDashboardOpen,
    registrationOpen,
    registrationAreaPreviewOpen,
    savedOperatorsOpen,
    verificationFleet,
  ]);

  if (registrationAreaPreviewOpen) {
    return (
      <div className={`${routePanelClass} min-h-dvh`}>
        <NearbyAreaScreen
          onBack={closeRegistrationOneKmPreview}
          onDone={closeRegistrationOneKmPreview}
          mode="oneKmPreview"
          backLabel="Back to price form"
        />
      </div>
    );
  }

  if (operatorInviteDocumentsInvite) {
    return (
      <div className={`${routePanelClass} min-h-dvh`}>
        <OperatorInviteDocumentsScreen
          invite={operatorInviteDocumentsInvite}
          onBack={() => {
            setRouteDirection("backward");
            setOperatorInviteDocumentsInvite(null);
          }}
          onSubmit={submitOperatorInviteDocuments}
        />
      </div>
    );
  }

  if (registrationOpen) {
    if (!registrationType) {
      return (
        <div className={`${routePanelClass} min-h-dvh`}>
          <TransportRegistrationTypeScreen
            onBack={() => {
              setRouteDirection("backward");
              setRegistrationOpen(false);
              setRegistrationType(null);
              setRegistrationSource(null);
            }}
            onSelect={(type) => {
              if (type === "company") {
                openCompanyRegistration("transport-chooser");
                return;
              }

              openSoloRegistration("transport-chooser");
            }}
          />
        </div>
      );
    }

    if (registrationType === "company") {
      return (
        <div className={`${routePanelClass} min-h-dvh`}>
          <CompanyRegistrationScreen
            existingCompany={companyAccount}
            onBack={closeRegistrationFlow}
            onSaveExit={exitRegistrationFlow}
            onComplete={(account) => {
              setCompanyAccount(account);
              setRegistrationOpen(false);
              setRegistrationType(null);
              setRegistrationSource(null);
              setRouteDirection("forward");
              setCompanyWorkspaceOpen(true);
            }}
          />
        </div>
      );
    }

    return (
      <div className={`${routePanelClass} min-h-dvh`}>
        <FleetRegistrationDrawer
          onClose={closeRegistrationFlow}
          onSaveExit={exitRegistrationFlow}
          onViewOneKmPreview={openRegistrationOneKmPreview}
          onComplete={finishOperatorRegistration}
        />
      </div>
    );
  }

  if (companyOperatorDashboardOpen && companyOperatorAccount) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <OperatorDashboardScreen
          account={companyOperatorAccount}
          companyAccount={companyAccount}
          companyLoading={companyLoading}
          initialView="dashboard"
          readOnly
          readOnlyReason="Company owner view. You can review passengers, trips, earnings, documents, and activity, but only the operator can make changes."
          onBack={() => {
            setRouteDirection("backward");
            setCompanyOperatorDashboardOpen(false);
            setCompanyWorkspaceOpen(true);
          }}
          onAccountUpdate={setCompanyOperatorAccount}
          onLocateArea={openNearbyAreaRoute}
          onOpenCompany={() => {
            setRouteDirection("backward");
            setCompanyOperatorDashboardOpen(false);
            setCompanyWorkspaceOpen(true);
          }}
        />
      </div>
    );
  }

  if (companyWorkspaceOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <CompanyWorkspaceScreen
          company={companyAccount}
          operatorAccount={operatorAccount}
          statusMessage={companyWorkspaceStatus}
          onCompanyUpdate={setCompanyAccount}
          onBack={() => {
            setRouteDirection("backward");
            setCompanyWorkspaceOpen(false);
          }}
          onOpenOperatorDashboard={openCompanyOperatorDashboard}
          onRegisterCompany={() => openCompanyRegistration("company-workspace")}
        />
      </div>
    );
  }

  if (operatorDashboardOpen && operatorAccount) {
    return (
      <div className={`${operatorDashboardClosing ? "kt-explore-stack-leave-right" : "kt-explore-stack-enter"} min-h-screen`}>
        <OperatorDashboardScreen
          account={operatorAccount}
          companyAccount={companyAccount}
          companyLoading={companyLoading}
          initialView={operatorDashboardView}
          onBack={closeOperatorDashboard}
          onAccountUpdate={setOperatorAccount}
          onLocateArea={openNearbyAreaRoute}
          onOpenCompany={companyAccount?.access?.canViewCompanyHq ? () => {
            setRouteDirection("forward");
            setCompanyWorkspaceOpen(true);
          } : undefined}
          onRegisterCompany={() => openCompanyRegistration("operator-dashboard")}
          onEditRegistration={() => {
            setRouteDirection("forward");
            setOperatorDashboardOpen(false);
            openSoloRegistration("operator-dashboard");
          }}
        />
      </div>
    );
  }

  if (nearbyAreaOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <NearbyAreaScreen
          onBack={() => {
            const returnToBooking = nearbyAreaRequest?.returnTo === "booking" && nearbyAreaRequest?.bookingTarget;
            const returnToExplore = String(nearbyAreaRequest?.returnTo || "").startsWith("explore-");
            setRouteDirection("backward");
            setNearbyAreaOpen(false);
            if (returnToBooking) {
              setBookingTarget(nearbyAreaRequest.bookingTarget);
            }
            setNearbyAreaRequest(null);
            if (returnToExplore) {
              window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "explore" } }));
            }
          }}
          initialDestination={nearbyAreaRequest?.destination}
          autoRoute={Boolean(nearbyAreaRequest?.autoRoute)}
          mode={nearbyAreaRequest?.mode || "standard"}
          pickerStart={nearbyAreaRequest?.pickerStart || "current"}
          pickerLabels={nearbyAreaRequest?.pickerLabels || null}
          onLocationPicked={async (location) => {
            const request = nearbyAreaRequest;
            const returnToExplore = String(request?.returnTo || "").startsWith("explore-");
            try {
              if (typeof request?.onLocationPicked === "function") {
                await request.onLocationPicked(location);
              }
            } finally {
              setRouteDirection("backward");
              setNearbyAreaOpen(false);
              setNearbyAreaRequest(null);
              if (returnToExplore) {
                window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "explore" } }));
              }
            }
          }}
          backLabel={
            nearbyAreaRequest?.returnTo === "booking"
              ? "Back to booking form"
              : nearbyAreaRequest?.returnTo === "explore-messages"
                ? "Back to messages"
                : "Back to transport"
          }
        />
      </div>
    );
  }

  if (activeFleetId) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <FleetProfileScreen
          fleetId={activeFleetId}
          onBack={() => {
            setRouteDirection("backward");
            setActiveFleetId(null);
          }}
          onShowVerification={setVerificationFleet}
          onOpenBooking={(target) => setBookingTarget(target)}
          onLocateArea={openNearbyAreaRoute}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (activeTripsOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <ActiveTripsScreen
          initialActionRequest={activeTripsActionRequest}
          onBack={() => {
            setRouteDirection("backward");
            setActiveTripsOpen(false);
            setActiveTripsActionRequest(null);
          }}
          onViewFleet={(fleetId) => {
            setRouteDirection("forward");
            setActiveFleetId(fleetId);
          }}
          onShowVerification={setVerificationFleet}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (savedOperatorsOpen) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <SavedOperatorsScreen
          onBack={() => {
            setRouteDirection("backward");
            setSavedOperatorsOpen(false);
          }}
          onViewFleet={(fleetId) => {
            setRouteDirection("forward");
            setActiveFleetId(fleetId);
          }}
          onShowVerification={setVerificationFleet}
          onOpenBooking={(target) => setBookingTarget(target)}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  if (fleetSelection) {
    return (
      <div className={`${routePanelClass} min-h-screen`}>
        <FleetListScreen
          selection={fleetSelection}
          onBack={() => {
            setRouteDirection("backward");
            setFleetSelection(null);
          }}
          onViewFleet={(fleetId) => {
            setRouteDirection("forward");
            setActiveFleetId(fleetId);
          }}
          onShowVerification={setVerificationFleet}
          onOpenBooking={(target) => setBookingTarget(target)}
        />
        <VerificationDetailsModal
          status={verificationFleet?.verificationStatus}
          operatorName={verificationFleet?.fleetName}
          onClose={() => setVerificationFleet(null)}
          onViewProfile={handleViewVerificationProfile}
          onContinue={handleContinueWithVerification}
          onChooseVerified={handleChooseVerifiedOperators}
          onBookOperator={handleBookVerificationFleet}
          onReportConcern={handleReportVerificationConcern}
        />
        {renderBookingDrawer()}
      </div>
    );
  }

  return (
    <div className={`${routeDirection === "backward" ? "kt-explore-stack-enter-left" : ""} min-h-screen bg-gray-50 relative`}>
      <Header
        companyAccount={companyAccount}
        companyLoading={companyLoading}
        operatorAccount={operatorAccount}
        operatorLoading={operatorLoading}
        onActivityChange={setHeaderActivityOpen}
        onViewFleet={setActiveFleetId}
        onRegisterFleet={() => {
          if (operatorAccount) {
            openOperatorDashboard("dashboard");
            return;
          }

          if (companyAccount) {
            setRouteDirection("forward");
            setCompanyWorkspaceOpen(true);
            return;
          }

          openRegistrationChooser();
        }}
      />
      <PassengerLiveTripHeaderCard
        onOpenTrips={(request) => {
          setActiveTripsActionRequest(request || null);
          setRouteDirection("forward");
          setActiveTripsOpen(true);
        }}
      />
      {operatorError && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {operatorError}
        </div>
      )}
      <CompanyOperatorInvitePanel
        invites={operatorCompanyInvites}
        loading={operatorInviteLoading}
        status={operatorInviteStatus}
        onAccept={acceptOperatorCompanyInvite}
        onCompleteRegistration={completeRegistrationForInvite}
        onDone={dismissCompletedOperatorInvite}
        onReject={rejectOperatorCompanyInvite}
      />
      <Body
        onSelectFleetType={(mode, fleetType, label) => {
          setRouteDirection("forward");
          setFleetSelection({ mode, fleetType, label, includeOffline: true });
        }}
        onOpenTopRated={() => {
          setRouteDirection("forward");
          setFleetSelection({ mode: "topRated", fleetType: null, label: "Top Rated Fleets", includeOffline: false });
        }}
        onOpenNearbyArea={() => {
          openNearbyAreaRoute();
        }}
        onOpenActiveTrips={() => {
          setActiveTripsActionRequest(null);
          setRouteDirection("forward");
          setActiveTripsOpen(true);
        }}
        onOpenSavedOperators={() => {
          setRouteDirection("forward");
          setSavedOperatorsOpen(true);
        }}
        onViewFleet={(fleetId) => {
          setRouteDirection("forward");
          setActiveFleetId(fleetId);
        }}
        onOpenBooking={(target) => setBookingTarget(target)}
        onLocateArea={openNearbyAreaRoute}
        onReportConcern={handleReportVerificationConcern}
      />
      <DocumentReuseDecisionModal
        invite={documentReuseInvite}
        onClose={() => setDocumentReuseInvite(null)}
        onContinue={continueWithExistingOperatorDocuments}
        onDeny={() => rejectOperatorCompanyInvite(documentReuseInvite)}
      />
      {renderBookingDrawer()}
    </div>
  );
}

function hasSubmittedOperatorDocuments(account) {
  if (!account || account.documentsSkipped) return false;
  const documents = account.dashboard?.verificationCenter?.documents || [];
  const status = account.verificationStatus || account.dashboard?.verificationCenter?.status || "";
  const uploads = account.uploads && typeof account.uploads === "object" ? Object.values(account.uploads).filter(Boolean) : [];
  return documents.length > 0 || uploads.length > 0 || ["verified", "recommended"].includes(status);
}

const operatorInviteDocumentFields = [
  {
    key: "nationalId",
    label: "National ID card",
    detail: "Upload a clear photo or scan of the operator's national identity card.",
  },
  {
    key: "license",
    label: "Driver or rider license",
    detail: "Use the license that allows you to operate this transport type.",
  },
  {
    key: "operatorPhoto",
    label: "Operator selfie/photo",
    detail: "Upload a recent face photo for identity verification.",
  },
  {
    key: "supportingDocument",
    label: "Supporting document",
    detail: "Optional permit, union card, background check, or other operator-only document.",
    optional: true,
  },
];

function OperatorInviteDocumentsScreen({ invite, onBack, onSubmit }) {
  const [documents, setDocuments] = useState({});
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const requiredDocuments = operatorInviteDocumentFields.filter((field) => !field.optional);

  function markDocument(field, file) {
    setDocuments((current) => ({
      ...current,
      [field.key]: {
        label: field.label,
        fileName: file?.name || "Selected",
        uploadedAt: new Date().toISOString(),
      },
    }));
    setStatus("");
  }

  async function submitDocuments() {
    const missing = requiredDocuments.filter((field) => !documents[field.key]?.fileName);
    if (missing.length) {
      setStatus(`Upload ${missing.map((field) => field.label.toLowerCase()).join(", ")} before submitting.`);
      return;
    }

    try {
      setSubmitting(true);
      setStatus("");
      await onSubmit?.(invite, documents);
    } catch (error) {
      setStatus(error.message || "Unable to submit these operator documents.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5">
        <div className="flex items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to company request"
            historyKey="transport-company-invite-documents"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Operator documents</p>
            <h1 className="truncate text-xl font-black text-slate-950">Complete company invitation</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 pb-8">
        <section className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <FiFileText size={23} />
          </span>
          <p className="mt-4 text-xs font-black uppercase tracking-wide text-blue-700">Company invitation</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">
            Upload only your operator documents
          </h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            {invite?.companyName || "This company"} invited you to operate under {invite?.fleetName || invite?.fleetType || "their Fleet HQ"}. The company already provides company and fleet records. You only need to submit documents that prove your operator identity and license.
          </p>
        </section>

        <section className="mt-4 grid gap-3">
          {operatorInviteDocumentFields.map((field) => {
            const selected = documents[field.key]?.fileName;
            return (
              <label key={field.key} className="block rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">
                      {field.label} {field.optional ? <span className="text-slate-400">(optional)</span> : null}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{field.detail}</p>
                    {selected ? <p className="mt-2 text-xs font-black text-blue-700">{selected}</p> : null}
                  </div>
                  <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-2xl ${selected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {selected ? <FiCheckCircle /> : <FiFileText />}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={(event) => markDocument(field, event.target.files?.[0])}
                />
                <span className="mt-3 inline-flex h-10 items-center rounded-2xl border border-blue-200 bg-blue-50 px-4 text-xs font-black text-blue-800">
                  {selected ? "Replace document" : "Choose document"}
                </span>
              </label>
            );
          })}
        </section>

        {status ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {status}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-[auto_1fr]">
          <button
            type="button"
            onClick={onBack}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submitDocuments}
            disabled={submitting}
            className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 disabled:opacity-60"
          >
            {submitting ? "Submitting documents..." : "Submit operator documents"}
          </button>
        </div>
      </main>
    </section>
  );
}

function normalizeDashboardVerification(value = "pending") {
  const map = {
    not_verified: "notVerified",
    verification_pending: "pending",
    verified_recommended: "recommended",
  };
  return map[value] || value || "pending";
}

function titleCaseTransportValue(value = "", fallback = "Not added") {
  const text = String(value || "").replace(/[_-]+/g, " ").trim();
  if (!text) return fallback;
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildReadOnlyOperatorAccount(invite, dashboard = null) {
  const operator = dashboard?.operator || {};
  const fleet = dashboard?.fleet || {};
  return {
    id: operator.id || invite.operatorId,
    userId: operator.user_id || invite.userId,
    fleetId: fleet.id || invite.companyFleetId,
    operatorId: operator.operator_code || "",
    displayCode: operator.display_code || invite.publicId,
    form: {
      name: operator.full_name || invite.name || "Registered operator",
      phone: operator.phone || "",
      country: fleet.country || operator.country || "",
      countryCode: fleet.country_iso || operator.country_iso || "",
      currency: fleet.currency || operator.currency || "",
      city: operator.city || invite.city || "",
      category: titleCaseTransportValue(fleet.service_category, "Transport"),
      fleetType: titleCaseTransportValue(fleet.fleet_type || invite.fleetType, "Fleet"),
      fleetName: fleet.fleet_name || invite.fleetName || "Registered Fleet",
      plateNumber: fleet.plate_number || invite.plateNumber || "",
      make: fleet.make || "",
      model: fleet.model || "",
      year: fleet.manufacture_year ? String(fleet.manufacture_year) : "",
      color: fleet.color || "",
      operatingArea: fleet.operating_area || invite.companyCity || "",
      availability: fleet.availability || "",
      homeBaseLocation: fleet.home_base_location || "",
      baseFare: fleet.base_fare ? String(fleet.base_fare) : "",
      pricePerKm: fleet.price_per_km ? String(fleet.price_per_km) : "",
      pricePerHour: fleet.price_per_hour ? String(fleet.price_per_hour) : "",
    },
    answers: fleet.safety_answers || {},
    uploads: {},
    documentsSkipped: Boolean(operator.documents_skipped),
    verificationStatus: normalizeDashboardVerification(fleet.verification_status || operator.verification_status || invite.verificationStatus),
    activeStatus: fleet.active_status || "offline",
    isVisibleToPassengers: Boolean(fleet.is_visible_to_passengers ?? true),
    walletBalance: Number(operator.wallet_balance || 0),
    pendingPayout: Number(operator.pending_payout || 0),
    status: operator.account_status || "submitted",
    savedAt: operator.updated_at || fleet.updated_at || invite.updatedAt,
    dashboard,
  };
}

function CompanyOperatorInvitePanel({ invites, loading, status, onAccept, onCompleteRegistration, onDone, onReject }) {
  const visibleInvites = invites.filter((invite) =>
    !invite.documents?.operatorAcknowledgedAt &&
      !["archived", "cancelled", "canceled", "declined", "rejected", "revoked"].includes(String(invite.status || "").toLowerCase()),
  );
  if (!visibleInvites.length && !status) return null;

  return (
    <section className="mx-4 mt-3 rounded-[28px] border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <FiBriefcase size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Company registration request</p>
          <h2 className="mt-1 text-lg font-black leading-tight text-slate-950">Transport company invitations</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            Review requests from companies that want you to operate under their Fleet HQ.
          </p>
        </div>
      </div>

      {status ? (
        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
          {status}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {loading && visibleInvites.length ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-black text-blue-700">
            Refreshing company requests...
          </div>
        ) : null}
        {visibleInvites.map((invite) => (
          <CompanyOperatorInviteCard
            key={`${invite.companyId || invite.companyName}-${invite.requestId}`}
            invite={invite}
            onAccept={onAccept}
            onCompleteRegistration={onCompleteRegistration}
            onDone={onDone}
            onReject={onReject}
          />
        ))}
      </div>
    </section>
  );
}

function CompanyOperatorInviteCard({ invite, onAccept, onCompleteRegistration, onDone, onReject }) {
  const needsDocuments = invite.status === "accepted_pending_documents" || invite.documents?.operatorDocumentsRequired;
  const accepted = invite.status === "accepted" && !needsDocuments;
  const rejected = invite.status === "rejected";
  const statusLabel = needsDocuments ? "Accepted" : accepted ? "Accepted" : rejected ? "Declined" : "Pending";
  const statusTone = needsDocuments || accepted
    ? "bg-blue-100 text-blue-700"
    : rejected
      ? "bg-rose-100 text-rose-700"
      : "bg-amber-100 text-amber-800";
  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            {needsDocuments ? "Operator documents needed" : "New request"}
          </p>
          <h3 className="mt-1 break-words text-base font-black text-slate-950">{invite.companyName || "Transport company"}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            {invite.fleetName || invite.fleetType || "Company fleet"} {invite.plateNumber ? `- ${invite.plateNumber}` : ""}
          </p>
        </div>
        <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black ${statusTone}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
        {needsDocuments
          ? "Upload your operator identity and license documents. The company and fleet documents are handled by the company."
          : accepted
            ? invite.documents?.reuseNotice || invite.documents?.reusedExistingDocuments
              ? "Accepted. KunThai will use your previously submitted operator identity and license documents for this company invitation."
              : "Accepted. This company can now keep your operator record in its Fleet HQ."
            : rejected
              ? "You declined this company request. The company will see that this invitation was not accepted."
              : "Accept if you want this company to register you as an operator. Reject if you do not want to join this company fleet."}
      </p>
      {!accepted && !rejected ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => (needsDocuments ? onCompleteRegistration(invite) : onAccept(invite))}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white"
        >
          {needsDocuments ? <FiFileText size={17} /> : <FiCheckCircle size={17} />}
          {needsDocuments ? "Upload documents" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => onReject(invite)}
          className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700"
        >
          <FiX size={17} />
          Reject
        </button>
        </div>
      ) : accepted ? (
        <button
          type="button"
          onClick={() => onDone?.(invite)}
          className="kt-pressable mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-lg shadow-emerald-700/15 transition hover:bg-emerald-700"
        >
          <FiCheckCircle size={17} />
          Done
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-3 text-xs font-black text-slate-600">
          No active action remains on this request.
        </div>
      )}
    </article>
  );
}

function DocumentReuseDecisionModal({ invite, onClose, onContinue, onDeny }) {
  if (!invite) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
      <section className="kt-modal-enter relative w-full max-w-lg rounded-[28px] bg-white p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"
          aria-label="Close document reuse notice"
        >
          <FiX />
        </button>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <FiShield size={23} />
        </span>
        <p className="mt-4 text-xs font-black uppercase tracking-wide text-emerald-700">Existing documents available</p>
        <h2 className="mt-1 pr-10 text-2xl font-black leading-tight text-slate-950">Use your submitted operator documents?</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {invite.companyName || "This company"} invited you to join {invite.fleetName || invite.fleetType || "their fleet"}. Since you have already submitted operator documents, KunThai can use your previous identity and license records for this company invitation.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onContinue}
            className="h-11 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onDeny}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
          >
            Deny
          </button>
        </div>
      </section>
    </div>
  );
}
