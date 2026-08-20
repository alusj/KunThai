import {
  BadgeHelp,
  BriefcaseBusiness,
  CreditCard,
  Crown,
  FileText,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteRegisteredBusiness, readRegisteredBusiness } from "../../../../../../Backend/services/marketplace/sellerRegistrationService";
import { showToast } from "../../../../../../Backend/services/toastService";
import { useI18n, t } from "../../../../../../i18n";
import MenuHeader from "./MenuHeader";
import SellerDrawerNavItem from "./SellerDrawerNavItem";
import SellerDrawerProfile from "./SellerDrawerProfile";
import SellerDrawerSection from "./SellerDrawerSection";
import AppPortal from "../../../../../shared/AppPortal";
import useBodyScrollLock from "../../../../../shared/useBodyScrollLock";
import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";

import BusinessAdmins from "./MyBizPages/BusinessAdmins/BusinessAdmins";
import BusinessSettings from "./MyBizPages/BusinessSettings/BusinessSettings";
import HelpSupport from "./MyBizPages/HelpSupport/HelpSupport";
import Privacy from "./MyBizPages/HelpSupport/Legal/Privacy";
import Payments from "./MyBizPages/PaymentsPayouts/Payments";
import ProfileSettings from "./MyBizPages/ProfileSettings/ProfileSettings";
import SellerBoard from "./MyBizPages/SellerBoard/SellerBoard";
import SubscriptionPlans from "./MyBizPages/SubscriptionPlans/SubscriptionPlans";
import { t as i18nText } from "../../../../../../i18n/index";

const SELLER_MENU_ANIMATION_MS = 360;

function getDrawerScreen(key, props = {}) {
  const screens = {
  profile: {
    component: <ProfileSettings initialView={props.profileInitialView} onBack={props.onBack} />,
  },
  business: {
    component: <BusinessSettings onBack={props.onBack} />,
  },
  payments: {
    component: <Payments onBack={props.onBack} />,
  },
  support: {
    component: <HelpSupport onBack={props.onBack} />,
  },
  legal: {
    component: <Privacy onBack={props.onBack} />,
  },
  board: {
    component: <SellerBoard onBack={props.onBack} />,
  },
  admins: {
    component: <BusinessAdmins onBack={props.onBack} onOpenPlans={props.onOpenPlans} />,
  },
  plans: {
    component: <SubscriptionPlans onBack={props.onBack} />,
  },
  };

  return screens[key] || null;
}

export default function MyBizMenu({
  isOpen,
  onClose,
  initialScreenKey = null,
  profileInitialView = "menu",
  onAddBusiness,
  permissions = null,
}) {
  // Owners have full menu access. Invited admins only see the sections their
  // responsibilities cover; store administration stays owner-only.
  useI18n();
  const canManageBusiness = permissions ? permissions.canManageBusiness : true;
  const canAccessDashboard = permissions ? permissions.canAccessDashboard : true;
  const canManagePlans = permissions ? permissions.canManagePlans : true;
  const [activeScreenKey, setActiveScreenKey] = useState(initialScreenKey);
  const [visibleScreenKey, setVisibleScreenKey] = useState(initialScreenKey);
  const [screenAction, setScreenAction] = useState("idle");
  const [rendered, setRendered] = useState(isOpen);
  const [panelOpen, setPanelOpen] = useState(isOpen);
  const [businessToDelete, setBusinessToDelete] = useState(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const menuTimerRef = useRef(null);
  const screenTimerRef = useRef(null);

  function clearMenuTimer() {
    if (menuTimerRef.current) {
      window.clearTimeout(menuTimerRef.current);
      menuTimerRef.current = null;
    }
  }

  function clearScreenTimer() {
    if (screenTimerRef.current) {
      window.clearTimeout(screenTimerRef.current);
      screenTimerRef.current = null;
    }
  }

  function openActiveScreen(screenKey) {
    clearScreenTimer();
    setVisibleScreenKey(screenKey);
    setActiveScreenKey(screenKey);
    setScreenAction("push");
    screenTimerRef.current = window.setTimeout(() => {
      setScreenAction("idle");
      screenTimerRef.current = null;
    }, SELLER_MENU_ANIMATION_MS);
  }

  function closeActiveScreen() {
    if (!visibleScreenKey) return;

    clearScreenTimer();
    setActiveScreenKey(null);
    setScreenAction("pop");
    screenTimerRef.current = window.setTimeout(() => {
      setVisibleScreenKey(null);
      setScreenAction("idle");
      screenTimerRef.current = null;
    }, SELLER_MENU_ANIMATION_MS);
  }

  function closeDrawer() {
    setActiveScreenKey(null);
    setVisibleScreenKey(null);
    setScreenAction("idle");
    setPanelOpen(false);
    onClose();
  }

  useEffect(() => {
    clearMenuTimer();
    clearScreenTimer();

    if (isOpen) {
      setRendered(true);
      setPanelOpen(true);
      setActiveScreenKey(initialScreenKey);
      setVisibleScreenKey(initialScreenKey);
      setScreenAction(initialScreenKey ? "push" : "idle");
      if (initialScreenKey) {
        screenTimerRef.current = window.setTimeout(() => {
          setScreenAction("idle");
          screenTimerRef.current = null;
        }, SELLER_MENU_ANIMATION_MS);
      }
      return undefined;
    }

    if (rendered) {
      setPanelOpen(false);
      menuTimerRef.current = window.setTimeout(() => {
        setRendered(false);
        setActiveScreenKey(null);
        setVisibleScreenKey(null);
        setScreenAction("idle");
        menuTimerRef.current = null;
      }, SELLER_MENU_ANIMATION_MS);
    }

    return undefined;
  // The closing animation intentionally reads the currently rendered panel once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreenKey, isOpen]);

  useBodyScrollLock(rendered);

  const goBackActiveScreen = useBrowserBack(
    Boolean(rendered && activeScreenKey),
    closeActiveScreen,
    `marketplace-business-menu-${activeScreenKey || "screen"}`,
  );
  const goBackDrawer = useBrowserBack(
    Boolean(rendered && !activeScreenKey),
    closeDrawer,
    "marketplace-business-menu-root",
  );
  const activeScreen = visibleScreenKey
    ? getDrawerScreen(visibleScreenKey, {
        profileInitialView,
        onBack: goBackActiveScreen,
        onOpenPlans: () => openActiveScreen("plans"),
      })
    : null;

  useEffect(() => {
    if (!rendered) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (activeScreenKey) {
        goBackActiveScreen();
        return;
      }
      goBackDrawer();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  // Drawer escape handling should bind only to the visible screen state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreenKey, rendered]);

  useEffect(() => {
    return () => {
      clearMenuTimer();
      clearScreenTimer();
    };
  }, []);

  if (!rendered) return null;

  const activePanelClass = screenAction === "push"
    ? "kt-explore-stack-enter"
    : screenAction === "pop"
      ? "kt-explore-stack-leave-right"
      : "translate-x-0";

  return (
    <AppPortal>
    <div className="kt-mobile-screen fixed inset-0 z-[1200] overflow-hidden">
      <aside
        aria-hidden={!isOpen}
        inert={isOpen && panelOpen ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 flex w-screen flex-col bg-gray-50 shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <MenuHeader
          title={t("urmall.biz.menu.sellerMenu")}
          onBack={goBackDrawer}
        />

        <div
          aria-hidden={Boolean(activeScreen)}
          inert={activeScreen ? "true" : undefined}
          className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto"
        >
              <SellerDrawerProfile
                onOpenProfile={() => openActiveScreen("profile")}
              />

              <div className="space-y-5 px-4 pt-5">
                {canManageBusiness || canAccessDashboard || canManagePlans ? (
                  <SellerDrawerSection title={t("urmall.biz.menu.sectionManageStore")}>
                    {canManageBusiness ? (
                      <SellerDrawerNavItem
                        icon={Plus}
                        title={t("urmall.biz.menu.addBusinessTitle")}
                        description={t("urmall.biz.menu.addBusinessDesc")}
                        onClick={() => {
                          closeDrawer();
                          onAddBusiness?.();
                        }}
                      />
                    ) : null}
                    {canAccessDashboard ? (
                      <SellerDrawerNavItem
                        icon={LayoutDashboard}
                        title={t("urmall.biz.menu.boardTitle")}
                        description={t("urmall.biz.menu.boardDesc")}
                        onClick={() => openActiveScreen("board")}
                      />
                    ) : null}
                    {canManagePlans ? (
                      <SellerDrawerNavItem
                        icon={Crown}
                        title="Plans & capacity"
                        description="Manage product limits, administrators, and Visibility Credit renewals."
                        onClick={() => openActiveScreen("plans")}
                      />
                    ) : null}
                    {canManageBusiness ? (
                      <>
                        <SellerDrawerNavItem
                          icon={UserRound}
                          title={t("urmall.biz.menu.profileTitle")}
                          description={t("urmall.biz.menu.profileDesc")}
                          onClick={() => openActiveScreen("profile")}
                        />
                        <SellerDrawerNavItem
                          icon={BriefcaseBusiness}
                          title={t("urmall.biz.menu.storeSettingsTitle")}
                          description={t("urmall.biz.menu.storeSettingsDesc")}
                          onClick={() => openActiveScreen("business")}
                        />
                        <SellerDrawerNavItem
                          icon={ShieldCheck}
                          title={t("urmall.biz.menu.adminsTitle")}
                          description={t("urmall.biz.menu.adminsDesc")}
                          onClick={() => openActiveScreen("admins")}
                        />
                      </>
                    ) : null}
                  </SellerDrawerSection>
                ) : null}

                {canManageBusiness ? (
                  <SellerDrawerSection title={t("urmall.biz.menu.sectionMoney")}>
                    <SellerDrawerNavItem
                      icon={CreditCard}
                      title={t("urmall.biz.menu.paymentsTitle")}
                      description={t("urmall.biz.menu.paymentsDesc")}
                      onClick={() => openActiveScreen("payments")}
                    />
                  </SellerDrawerSection>
                ) : null}

                <SellerDrawerSection title={t("urmall.biz.menu.sectionSupport")}>
                  <SellerDrawerNavItem
                    icon={BadgeHelp}
                    title={t("urmall.biz.menu.supportTitle")}
                    description={t("urmall.biz.menu.supportDesc")}
                    onClick={() => openActiveScreen("support")}
                  />
                  <SellerDrawerNavItem
                    icon={FileText}
                    title={t("urmall.biz.menu.legalTitle")}
                    description={t("urmall.biz.menu.legalDesc")}
                    onClick={() => openActiveScreen("legal")}
                  />
                </SellerDrawerSection>

                {canManageBusiness ? (
                <SellerDrawerSection title={t("urmall.biz.menu.sectionDanger")}>
                  <SellerDrawerNavItem
                    icon={Trash2}
                    title={t("urmall.biz.menu.deleteTitle")}
                    description={t("urmall.biz.menu.deleteDesc")}
                    onClick={() => {
                      readRegisteredBusiness()
                        .then((business) => {
                          if (!business) {
                            showToast(t("urmall.biz.menu.noWorkspace"), "danger");
                            return;
                          }
                          setBusinessToDelete(business);
                        })
                        .catch(() => showToast(t("urmall.biz.menu.loadBusinessFailed"), "danger"));
                    }}
                  />
                </SellerDrawerSection>
                ) : null}
              </div>
            </div>
      </aside>

      {activeScreen ? (
        <section className={`kt-urmall-screen-panel absolute inset-0 z-10 flex w-screen flex-col bg-white shadow-2xl ${activePanelClass}`} data-back-swipe-scope>
          <div className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto">
            {activeScreen.component}
          </div>
        </section>
      ) : null}

      {businessToDelete ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label={t("urmall.biz.menu.deleteModalAria")}
            className="kt-toast-expand-in w-full max-w-md rounded-[28px] border border-rose-100 bg-white p-6 shadow-2xl"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 size={22} />
            </span>
            <h2 className="mt-4 text-2xl font-black text-slate-950">
              {t("urmall.biz.menu.deleteConfirm", { name: businessToDelete.identity?.businessName || t("urmall.biz.menu.thisBusiness") })}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {t("urmall.biz.menu.deleteWarning", { kind: String(businessToDelete.businessKind || i18nText("ui.literals.k6a577a7743f4")).replaceAll("_", " ") })}
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase text-slate-500">{t("urmall.biz.menu.reason")}</span>
              <textarea
                value={deletionReason}
                onChange={(event) => setDeletionReason(event.target.value)}
                rows={4}
                placeholder={t("urmall.biz.menu.reasonPlaceholder")}
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400"
              />
            </label>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={requestingDeletion}
                onClick={() => {
                  setBusinessToDelete(null);
                  setDeletionReason("");
                }}
                className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                {t("urmall.biz.menu.keepBusiness")}
              </button>
              <button
                type="button"
                disabled={requestingDeletion}
                onClick={async () => {
                  setRequestingDeletion(true);
                  try {
                    await deleteRegisteredBusiness(businessToDelete.id);
                    showToast(t("urmall.biz.menu.deletionSent"), "success", { title: t("urmall.biz.menu.deletionSentTitle") });
                    setBusinessToDelete(null);
                    setDeletionReason("");
                    closeDrawer();
                  } catch (error) {
                    showToast(error.message || t("urmall.biz.menu.deletionFailed"), "danger");
                  } finally {
                    setRequestingDeletion(false);
                  }
                }}
                className="h-12 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-60"
              >
                {requestingDeletion ? t("urmall.detail.sending") : t("urmall.biz.menu.sendRequest")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
    </AppPortal>
  );
}
