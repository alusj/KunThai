import {
  BadgeHelp,
  BriefcaseBusiness,
  CreditCard,
  FileText,
  LayoutDashboard,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteRegisteredBusiness, readRegisteredBusiness } from "../../../../../../Backend/services/marketplace/sellerRegistrationService";
import { showToast } from "../../../../../../Backend/services/toastService";
import MenuHeader from "./MenuHeader";
import SellerDrawerNavItem from "./SellerDrawerNavItem";
import SellerDrawerProfile from "./SellerDrawerProfile";
import SellerDrawerSection from "./SellerDrawerSection";
import AppPortal from "../../../../../shared/AppPortal";
import useBodyScrollLock from "../../../../../shared/useBodyScrollLock";

import BusinessSettings from "./MyBizPages/BusinessSettings/BusinessSettings";
import HelpSupport from "./MyBizPages/HelpSupport/HelpSupport";
import Privacy from "./MyBizPages/HelpSupport/Legal/Privacy";
import Payments from "./MyBizPages/PaymentsPayouts/Payments";
import ProfileSettings from "./MyBizPages/ProfileSettings/ProfileSettings";
import SellerBoard from "./MyBizPages/SellerBoard/SellerBoard";

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
  };

  return screens[key] || null;
}

export default function MyBizMenu({
  isOpen,
  onClose,
  initialScreenKey = null,
  profileInitialView = "menu",
  onAddBusiness,
}) {
  const [activeScreenKey, setActiveScreenKey] = useState(initialScreenKey);
  const [visibleScreenKey, setVisibleScreenKey] = useState(initialScreenKey);
  const [screenAction, setScreenAction] = useState("idle");
  const [rendered, setRendered] = useState(isOpen);
  const [panelOpen, setPanelOpen] = useState(isOpen);
  const [businessToDelete, setBusinessToDelete] = useState(null);
  const [deletingBusiness, setDeletingBusiness] = useState(false);
  const menuTimerRef = useRef(null);
  const screenTimerRef = useRef(null);
  const activeScreen = visibleScreenKey
    ? getDrawerScreen(visibleScreenKey, {
        profileInitialView,
        onBack: closeActiveScreen,
      })
    : null;

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

  useEffect(() => {
    if (!rendered) return undefined;

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      if (activeScreenKey) {
        closeActiveScreen();
        return;
      }
      closeDrawer();
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

  function closeDrawer() {
    setActiveScreenKey(null);
    setVisibleScreenKey(null);
    setScreenAction("idle");
    setPanelOpen(false);
    onClose();
  }

  const activePanelClass = screenAction === "push"
    ? "kt-explore-stack-enter"
    : screenAction === "pop"
      ? "kt-explore-stack-leave-right"
      : "translate-x-0";

  return (
    <AppPortal>
    <div className="fixed inset-0 z-[1200] overflow-hidden">
      <aside
        aria-hidden={!isOpen}
        inert={isOpen && panelOpen ? undefined : "true"}
        className={`kt-urmall-screen-panel fixed inset-0 flex h-dvh w-screen flex-col bg-gray-50 shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <MenuHeader
          title="Seller Menu"
          onBack={closeDrawer}
        />

        <div
          aria-hidden={Boolean(activeScreen)}
          inert={activeScreen ? "true" : undefined}
          className="min-h-0 flex-1 overflow-y-auto pb-6"
        >
              <SellerDrawerProfile
                onOpenProfile={() => openActiveScreen("profile")}
              />

              <div className="space-y-5 px-4 pt-5">
                <SellerDrawerSection title="Manage Store">
                  <SellerDrawerNavItem
                    icon={Plus}
                    title="Add another business"
                    description="Create a separate retail, restaurant, hotel, or property workspace."
                    onClick={() => {
                      closeDrawer();
                      onAddBusiness?.();
                    }}
                  />
                  <SellerDrawerNavItem
                    icon={LayoutDashboard}
                    title="Seller Board"
                    description="Orders, messages, products, delivery, verification, reports, and policies."
                    onClick={() => openActiveScreen("board")}
                  />
                  <SellerDrawerNavItem
                    icon={UserRound}
                    title="Profile"
                    description="Owner profile, public seller details, and business identity."
                    onClick={() => openActiveScreen("profile")}
                  />
                  <SellerDrawerNavItem
                    icon={BriefcaseBusiness}
                    title="Store Settings"
                    description="Store details, categories, pickup, delivery, and operating hours."
                    onClick={() => openActiveScreen("business")}
                  />
                </SellerDrawerSection>

                <SellerDrawerSection title="Money & Trust">
                  <SellerDrawerNavItem
                    icon={CreditCard}
                    title="Payments & Payouts"
                    description="Bank details, payout history, transactions, and withdrawals."
                    onClick={() => openActiveScreen("payments")}
                  />
                </SellerDrawerSection>

                <SellerDrawerSection title="Support">
                  <SellerDrawerNavItem
                    icon={BadgeHelp}
                    title="Help & Support"
                    description="Contact support, help guides, and seller questions."
                    onClick={() => openActiveScreen("support")}
                  />
                  <SellerDrawerNavItem
                    icon={FileText}
                    title="Privacy & Legal"
                    description="Privacy policy, terms, data usage, and community guidelines."
                    onClick={() => openActiveScreen("legal")}
                  />
                </SellerDrawerSection>

                <SellerDrawerSection title="Danger zone">
                  <SellerDrawerNavItem
                    icon={Trash2}
                    title="Delete this business"
                    description="Permanently remove this business, its products, and its records. Your other businesses and your KunThai account stay."
                    onClick={() => {
                      readRegisteredBusiness()
                        .then((business) => {
                          if (!business) {
                            showToast("No active business workspace was found.", "danger");
                            return;
                          }
                          setBusinessToDelete(business);
                        })
                        .catch(() => showToast("Unable to load this business right now.", "danger"));
                    }}
                  />
                </SellerDrawerSection>
              </div>
            </div>
      </aside>

      {activeScreen ? (
        <section className={`absolute inset-0 z-10 flex h-dvh w-screen flex-col bg-white shadow-2xl ${activePanelClass}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeScreen.component}
          </div>
        </section>
      ) : null}

      {businessToDelete ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete business"
            className="kt-toast-expand-in w-full max-w-md rounded-[28px] border border-rose-100 bg-white p-6 shadow-2xl"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <Trash2 size={22} />
            </span>
            <h2 className="mt-4 text-2xl font-black text-slate-950">
              Delete {businessToDelete.identity?.businessName || "this business"}?
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              This permanently removes this {String(businessToDelete.businessKind || "business").replaceAll("_", " ")} workspace,
              including its products, categories, documents, and order history. Your other business
              workspaces and your personal KunThai account are not affected. This cannot be undone.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={deletingBusiness}
                onClick={() => setBusinessToDelete(null)}
                className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                Keep business
              </button>
              <button
                type="button"
                disabled={deletingBusiness}
                onClick={async () => {
                  setDeletingBusiness(true);
                  try {
                    await deleteRegisteredBusiness(businessToDelete.id);
                    showToast("Your business was deleted. Other workspaces remain untouched.", "success");
                    setBusinessToDelete(null);
                    closeDrawer();
                  } catch (error) {
                    showToast(error.message || "Unable to delete this business.", "danger");
                  } finally {
                    setDeletingBusiness(false);
                  }
                }}
                className="h-12 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-60"
              >
                {deletingBusiness ? "Deleting…" : "Delete business"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
    </AppPortal>
  );
}
