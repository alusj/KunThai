import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wifi, WifiOff } from "lucide-react";

import { useI18n, t } from "../../i18n";

// A persistent, app-wide "you're offline" strip pinned to the very top. It
// stays visible for as long as the device reports itself offline, then flips to
// a brief "back online" confirmation when the connection returns. The wrapper
// is pointer-events-none so it never blocks taps on the app underneath.
export default function NetworkStatusBanner() {
  useI18n();
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  const [reconnected, setReconnected] = useState(false);
  const wasOfflineRef = useRef(offline);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    function handleOffline() {
      wasOfflineRef.current = true;
      window.clearTimeout(reconnectTimerRef.current);
      setReconnected(false);
      setOffline(true);
    }
    function handleOnline() {
      setOffline(false);
      if (wasOfflineRef.current) {
        setReconnected(true);
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => setReconnected(false), 2600);
      }
      wasOfflineRef.current = false;
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  if (typeof document === "undefined") return null;
  if (!offline && !reconnected) return null;

  const online = !offline;
  return createPortal(
    <div className="kt-network-banner pointer-events-none fixed inset-x-0 top-0 z-[1250]" role="status" aria-live="polite">
      <div
        key={online ? "online" : "offline"}
        className={`flex items-center justify-center gap-2 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-center text-xs font-black text-white shadow-md ${
          online ? "bg-emerald-600" : "bg-amber-600"
        }`}
      >
        {online ? <Wifi size={14} strokeWidth={2.6} /> : <WifiOff size={14} strokeWidth={2.6} />}
        <span>{online ? t("common.backOnline") : t("common.offlineBanner")}</span>
      </div>
    </div>,
    document.body,
  );
}
