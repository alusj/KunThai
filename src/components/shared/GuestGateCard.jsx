import { useEffect, useRef, useState } from "react";
import { LogIn, ShieldAlert, X } from "lucide-react";

import { endGuestVisit, GUEST_GATE_EVENT } from "../../Backend/services/guestModeService";
import AppPortal from "./AppPortal";

const AUTO_HIDE_MS = 9000;

export default function GuestGateCard() {
  const [gate, setGate] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    function handleGate(event) {
      window.clearTimeout(hideTimerRef.current);
      setGate({
        reaction: event.detail?.reaction || "react",
        target: event.detail?.target || "post",
      });
      hideTimerRef.current = window.setTimeout(() => setGate(null), AUTO_HIDE_MS);
    }

    window.addEventListener(GUEST_GATE_EVENT, handleGate);
    return () => {
      window.removeEventListener(GUEST_GATE_EVENT, handleGate);
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!gate) return null;

  return (
    <AppPortal>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1500] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-8">
        <section
          role="alertdialog"
          aria-label="Sign in to continue"
          className="kt-toast-expand-in pointer-events-auto w-full max-w-md overflow-hidden rounded-[26px] border border-orange-300 bg-white shadow-2xl shadow-orange-950/25"
        >
          <div className="h-1.5 bg-gradient-to-r from-orange-500 via-rose-500 to-red-600" />

          <div className="flex items-start gap-3 p-5 pb-0">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-orange-100 text-orange-700 ring-1 ring-orange-200">
              <ShieldAlert size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-950">
                Sign in required before you {gate.reaction} this {gate.target}.
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                Guest mode is view-only. To post, comment, message, shop, or book, use a real KunThai account.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGate(null)}
              aria-label="Dismiss"
              className="kt-touchable grid h-9 w-9 flex-none place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-5 pt-4">
            <button
              type="button"
              onClick={() => setGate(null)}
              className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700"
            >
              Keep browsing
            </button>
            <button
              type="button"
              onClick={async () => {
                setLeaving(true);
                await endGuestVisit();
              }}
              disabled={leaving}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-orange-500 text-sm font-black text-white shadow-lg shadow-orange-900/25 transition hover:bg-orange-600 disabled:opacity-60"
            >
              <LogIn size={17} />
              {leaving ? "Opening..." : "Sign in to continue"}
            </button>
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
