import { Capacitor, registerPlugin } from "@capacitor/core";

// Tells the native app that KunThai has drawn its first real screen (the
// loading skeleton or the page itself), so the native splash can leave.
// Until then the splash stays up (at most a few seconds), so reopening the
// app never shows a blank screen while the web content loads or, on iPhone,
// reloads after iOS cleared it in the background.
// Native: ios/App/App/KunThaiBridgeViewController.swift (KunThaiLaunchPlugin)
// and android/app/src/main/java/app/kunthai/mobile/KunThaiLaunchPlugin.java.

const KunThaiLaunch = registerPlugin("KunThaiLaunch");

export function notifyNativeAppReady() {
  if (typeof window === "undefined") return;
  // Read by the iPhone app when KunThai returns from the background: missing
  // means iOS cleared the page and it is reloading.
  window.__ktReady = true;
  try {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("KunThaiLaunch")) return;
  } catch {
    return;
  }
  KunThaiLaunch.ready().catch(() => {});
}
