/* eslint-disable react-refresh/only-export-components -- application entry point owns the root boundary and route split. */
import { Component, Suspense } from 'react'
// First: counts this page load and every resume (lifecycleAudit.js).
import "./Backend/services/lifecycleAudit.js";
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import "./styles/bankTheme.css";
import "./styles/appearance.css";
import ToastProvider from "./components/Explore/shared/ToastProvider.jsx";
import { AppearanceProvider } from "./components/AppearanceProvider.jsx";
import { initNativePushNotifications, registerKunThaiServiceWorker } from "./Backend/services/pushService.js";
import { initAppleCreditPurchases } from "./Backend/services/appleIapService.js";
import { initGooglePlayCreditPurchases } from "./Backend/services/googlePlayBillingService.js";
import { initCountryConfig } from "./Backend/services/countryConfigService.js";
import { t as i18nText } from "./i18n/index";
import { installMobileViewportVariables } from "./Backend/services/mobileViewportService";
import { installNativeShare } from "./Backend/services/nativeShare";
import { lazyWithRetry } from "./Backend/utils/lazyWithRetry";
import { useI18n as useUiLocale } from "./i18n/index.js";
import { startSwipStartupPrefetch } from "./Backend/services/explore/swipStartupPrefetch";
import { installQuietReload } from "./Backend/services/quietReload";

registerKunThaiServiceWorker();
initNativePushNotifications();
initAppleCreditPurchases();
initGooglePlayCreditPurchases();
initCountryConfig();
installMobileViewportVariables();
// In the iOS / Android app, Share buttons open the phone's share sheet and
// share kunthai.app links rather than the app's on-device address.
installNativeShare();
// Swip's first page and first clips download while the splash is still up,
// so Swip plays at once (not on the admin or public pages).
if (!/^\/(admin|policy-center|privacy|terms|support|track)(\/|$)/.test(window.location.pathname)) {
  startSwipStartupPrefetch();
  // Back after 15 minutes or more: a fresh start, unseen (quietReload.js).
  installQuietReload();
}

const AdminApp = lazyWithRetry(() => import("./admin/AdminApp.jsx"));
const PublicPolicyPage = lazyWithRetry(() => import("./components/public/PublicPolicyPage.jsx"));
const PublicSupportPage = lazyWithRetry(() => import("./components/public/PublicSupportPage.jsx"));
const PublicParcelTrackingPage = lazyWithRetry(() => import("./components/public/PublicParcelTrackingPage.jsx"));

function RootApplication() {
  useUiLocale();
  const pathname = window.location.pathname;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPolicyCenterPath = pathname === "/policy-center" || pathname.startsWith("/policy-center/");
  const policyCenterSlug = isPolicyCenterPath ? decodeURIComponent(pathname.replace(/^\/policy-center\/?/, "")) : "";
  const publicPolicyId = pathname === "/privacy" ? "privacy" : pathname === "/terms" ? "terms" : policyCenterSlug;

  if (isAdminPath) {
    return (
      // No admin wording while loading: non-admins are sent back to the app.
      <Suspense fallback={<div className="min-h-screen bg-white" aria-busy="true" />}>
        <AdminApp />
      </Suspense>
    );
  }

  // A parcel receiver's tracking link (/track/<token>); no sign-in required.
  const parcelTrackingToken = (pathname.match(/^\/track\/([0-9a-f]{16,64})\/?$/i) || [])[1] || "";
  if (parcelTrackingToken) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50" aria-busy="true" />}>
        <PublicParcelTrackingPage token={parcelTrackingToken} />
      </Suspense>
    );
  }

  // Public support page (App Store Support URL); no sign-in required.
  if (pathname === "/support" || pathname === "/support/") {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-bold text-slate-600">{i18nText("ui.literals.kde99f5ae7e28")}</div>}>
        <PublicSupportPage />
      </Suspense>
    );
  }

  if (publicPolicyId || isPolicyCenterPath) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-bold text-slate-600">{i18nText("ui.literals.kde99f5ae7e28")}</div>}>
        <PublicPolicyPage initialPolicyId={publicPolicyId} />
      </Suspense>
    );
  }

  return <App />;
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, message: error?.message || "" };
  }

  componentDidCatch(error) {
    console.error("[KunThai] App render failed", error);
  }

  componentDidMount() {
    window.addEventListener("online", this.handleOnline);
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.handleOnline);
  }

  handleOnline = () => {
    if (this.state.failed && !this.isChunkLoadFailure()) {
      this.setState({ failed: false, message: "" });
    }
  };

  isChunkLoadFailure() {
    return /chunk|dynamically imported module|failed to fetch|load failed|loading css chunk/i.test(this.state.message || "");
  }

  retry = () => {
    this.setState({ failed: false, message: "" });
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.failed) {
      const chunkFailure = this.isChunkLoadFailure();
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
          <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <h1 className="text-base font-black text-slate-950">{i18nText("ui.literals.kc1e191c89198")}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {chunkFailure
                ? i18nText("ui.literals.k17269be9c941")
                : i18nText("ui.literals.k3c98c95829ee")}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={this.retry} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                {i18nText("ui.literals.k042c862e4467")}
              </button>
              <button type="button" onClick={this.reload} className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
                {i18nText("ui.literals.kb33983286b20")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <AppearanceProvider>
      <ToastProvider>
        <RootApplication />
      </ToastProvider>
    </AppearanceProvider>
  </AppErrorBoundary>

)
 
