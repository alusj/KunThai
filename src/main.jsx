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

registerKunThaiServiceWorker();

const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));
const PublicPolicyPage = lazy(() => import("./components/public/PublicPolicyPage.jsx"));

function RootApplication() {
  const pathname = window.location.pathname;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const publicPolicyId = pathname === "/privacy" ? "privacy" : pathname === "/terms" ? "terms" : "";

  if (isAdminPath) {
    return (
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-100 text-sm font-bold text-zinc-600">Opening KunThai Admin…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  if (publicPolicyId) {
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
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[KunThai] App render failed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
          <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <h1 className="text-base font-black text-slate-950">KunThai is recovering</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Something failed while loading this screen. Refresh once to reload your latest data.
            </p>
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
 
