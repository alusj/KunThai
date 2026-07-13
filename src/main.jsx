/* eslint-disable react-refresh/only-export-components -- application entry point owns the root boundary and route split. */
import { Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import "./styles/bankTheme.css";
import "./styles/appearance.css";
import ToastProvider from "./components/Explore/shared/ToastProvider.jsx";
import { AppearanceProvider } from "./components/AppearanceProvider.jsx";
import { registerKunThaiServiceWorker } from "./Backend/services/pushService.js";
import { initCountryConfig } from "./Backend/services/countryConfigService.js";

registerKunThaiServiceWorker();
initCountryConfig();

const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));
const PublicPolicyPage = lazy(() => import("./components/public/PublicPolicyPage.jsx"));

function RootApplication() {
  const pathname = window.location.pathname;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPolicyCenterPath = pathname === "/policy-center" || pathname.startsWith("/policy-center/");
  const policyCenterSlug = isPolicyCenterPath ? decodeURIComponent(pathname.replace(/^\/policy-center\/?/, "")) : "";
  const publicPolicyId = pathname === "/privacy" ? "privacy" : pathname === "/terms" ? "terms" : policyCenterSlug;

  if (isAdminPath) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-100 text-sm font-bold text-zinc-600">Opening KunThai Admin…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  if (publicPolicyId || isPolicyCenterPath) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-bold text-slate-600">Opening KunThai policies…</div>}>
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
            <h1 className="text-base font-black text-slate-950">KunThai is recovering</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {chunkFailure
                ? "Your connection may have dropped while KunThai was loading an app file. Reload once when the network is stable."
                : "Something failed while loading this screen. Try again, or reload if the problem continues."}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={this.retry} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
                Try again
              </button>
              <button type="button" onClick={this.reload} className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800">
                Reload app
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
 
