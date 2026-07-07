import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";

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
          aria-label="Create an account to continue"
          className="kt-toast-expand-in pointer-events-auto w-full max-w-md rounded-[26px] border border-sky-200 bg-white p-5 shadow-2xl shadow-slate-950/25"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-950">
                Sorry — you cannot {gate.reaction} this {gate.target} as a guest.
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                Create a free KunThai account to react, post, message, shop, and book transport.
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
          <div className="mt-4 grid grid-cols-2 gap-2">
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
                // Ends the guest visit and lands on the sign-in screen.
                await endGuestVisit();
              }}
              disabled={leaving}
              className="h-11 rounded-2xl bg-sky-700 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-60"
            >
              {leaving ? "Opening…" : "Create an account"}
            </button>
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
