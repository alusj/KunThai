import {
  BadgeHelp,
  BriefcaseBusiness,
  CreditCard,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import MenuHeader from "./MenuHeader";
import SellerDrawerNavItem from "./SellerDrawerNavItem";
import SellerDrawerProfile from "./SellerDrawerProfile";
import SellerDrawerSection from "./SellerDrawerSection";
import AppPortal from "../../../../../shared/AppPortal";

import BusinessSettings from "./MyBizPages/BusinessSettings/BusinessSettings";
import HelpSupport from "./MyBizPages/HelpSupport/HelpSupport";
import Privacy from "./MyBizPages/HelpSupport/Legal/Privacy";
import Payments from "./MyBizPages/PaymentsPayouts/Payments";
import ProfileSettings from "./MyBizPages/ProfileSettings/ProfileSettings";
import Security from "./MyBizPages/Security/Security";
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
  security: {
    component: <Security onBack={props.onBack} />,
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
}) {
  const [activeScreenKey, setActiveScreenKey] = useState(initialScreenKey);
  const [visibleScreenKey, setVisibleScreenKey] = useState(initialScreenKey);
  const [screenAction, setScreenAction] = useState("idle");
  const [rendered, setRendered] = useState(isOpen);
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
      menuTimerRef.current = window.setTimeout(() => {
        setRendered(false);
        setActiveScreenKey(null);
        setVisibleScreenKey(null);
        setScreenAction("idle");
        menuTimerRef.current = null;
      }, SELLER_MENU_ANIMATION_MS);
    }

    return undefined;
  }, [initialScreenKey, isOpen]);

  useEffect(() => {
    if (!rendered) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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
      document.body.style.overflow = previousOverflow;
    };
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
        inert={isOpen ? undefined : "true"}
        className="kt-urmall-screen-panel fixed inset-0 flex h-dvh w-screen flex-col bg-gray-50 shadow-2xl"
        style={{ transform: isOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)" }}
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
                    icon={LayoutDashboard}
                    title="Seller Board"
                    description="Orders, messages, products, delivery, verification, reports, security, and policies."
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
                  <SellerDrawerNavItem
                    icon={LockKeyhole}
                    title="Security"
                    description="Password, login activity, and two-factor authentication."
                    onClick={() => openActiveScreen("security")}
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
    </div>
    </AppPortal>
  );
}
