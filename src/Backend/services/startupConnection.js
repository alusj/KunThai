// Shared by the launch checks (saved sign-in, account check, two-step check).
// Each one waits a little for the server before falling back to what is saved
// on this device. Once one of them finds no connection, the others skip their
// wait, so an offline launch waits once (not once per check) and never shows
// an empty screen in between.

let connectionMissing = false;

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    connectionMissing = false;
  });
}

export function markStartupOffline() {
  connectionMissing = true;
}

export function startupLooksOffline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return connectionMissing;
}
