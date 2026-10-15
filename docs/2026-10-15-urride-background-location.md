# UrRide background location for online operators (Phase 2) — 2026-10-15

An operator who switches **Active** on now keeps sharing their position with the phone locked or KunThai in the background, the way Uber and Bolt drivers do. Passengers' "Available near you" list (Phase 1, `transport_available_operators_nearby`, 2-minute window) keeps showing them. Sharing stops when they switch Active off, sign out or switch account.

No database change. No new SQL to run.

## What changed

### Plugin
- `@capgo/background-geolocation` **8.4.14** (exact), MPL-2.0, free, no license key. Peer dependency `@capacitor/core >= 8`, and its `Package.swift` depends on `capacitor-swift-pm` 8.x.
- Why not `@capacitor-community/background-geolocation` (latest 1.2.26, August 2025): its `Package.swift` pins `capacitor-swift-pm` `from: "7.0.0"` (so below 8.0.0). `ios/App/CapApp-SPM` pins 8.4.2, so Swift Package Manager couldn't resolve both and the iOS build would break. Capgo's plugin is the maintained fork of the same code, and has the same `backgroundMessage`, `backgroundTitle`, `requestPermissions` and `distanceFilter` options. It runs one watcher through `start()` and `stop()`, and adds `checkPermissions`, `requestPermissions` and `openSettings`.
- Registered in `ios/App/CapApp-SPM/Package.swift`, in the `packageClassList` in `ios/App/App/capacitor.config.json`, in `android/capacitor.settings.gradle` and in `android/app/capacitor.build.gradle` (all via `npx cap update`).

### iOS (`ios/App/App/Info.plist`)
- `UIBackgroundModes` → `location`.
- New `NSLocationAlwaysAndWhenInUseUsageDescription`. `NSLocationWhenInUseUsageDescription` now also says that online operators are shown to nearby passengers and that sharing stops when they go offline.
- While sharing in the background, iOS shows its blue location indicator in the status bar.

### Android
- `AndroidManifest.xml`: `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` (`POST_NOTIFICATIONS` was already there). The plugin's own manifest adds the foreground service (`foregroundServiceType="location"`), `WAKE_LOCK`, and a geofence receiver with `RECEIVE_BOOT_COMPLETED`. KunThai doesn't use geofencing, so that receiver does nothing.
- **No `ACCESS_BACKGROUND_LOCATION`.** Sharing runs in a foreground service that starts while KunThai is open, and it shows a persistent notification: "KunThai: you're online — Nearby passengers can see you. Go offline in KunThai to stop sharing your location." (translated).
- `uses-feature android.hardware.location.gps` keeps `required="false"` with `tools:node="replace"`. Without that, the plugin's declaration would make GPS required on Google Play.
- `capacitor.config.json`: `android.useLegacyBridge: true`. The plugin's README calls for it, because without it location callbacks stop reaching JavaScript after about 5 minutes in the background.

### App code
- `src/components/services/operatorLiveLocationService.js`: same exports and the same behaviour for the dashboard, `OperatorPresenceHost` and `OperatorVisibilityStatus`.
  - **Web** (browser, or an app build without the plugin synced): unchanged `navigator.geolocation` path.
  - **Native**:
    - Uses the plugin watcher with a translated notification title and message, a 25 m distance filter, `stale: false`, and Android `networkFallback` (a coarse network fix when GPS is silent).
    - Asks for permission (`requestPermissions: true`) only when the operator switches Active on or taps **Share location**. Resuming at launch never prompts.
    - Heartbeat: every 10 s, if nothing was written for 30 s, the last known fix is written again (`last_seen_at` refreshed). So a parked operator checks in every 30–40 s.
    - Writes keep the 6 s / 12 m throttle.
    - If the plugin fails to start, it falls back to the web path.
- `operatorLocationPolicy.js` (pure decisions) and `operatorNativeLocationSession.js` (plugin lifecycle, plugin injected) are both unit tested.
- **Permission sheet** (`OperatorBackgroundLocationSheet.jsx`, hosted by `OperatorPresenceHost`):
  - When does it show? When an operator switches Active on in the native app and the system can still ask: location never asked; or iOS "While using" / Android notifications not yet allowed, the first time only.
  - What does it say? "Stay visible with your phone locked — To stay visible to passengers while your phone is locked, allow location "Always"…" (on Android: "allow location and notifications").
  - **Continue** lets the system prompts appear. **Not now** still goes online, without prompting.
- **Amber hint** under "Visible to passengers": shown when iOS location is "While using" ("…Choose "Always" to stay visible.") or location is off for KunThai. It has an **Open settings** button (the plugin's `openSettings`, which opens KunThai's app settings). The permission is re-read whenever KunThai returns to the foreground.
- Translations: `src/i18n/urrideBackgroundLocation.js`, 13 keys in all 15 locales, with a parity test in `urrideBackgroundLocation.test.js`.

## Owner steps

1. `npm install` (installs `@capgo/background-geolocation@8.4.14`), then `npm run build`, then `npx cap sync`.
2. **Xcode**: open `ios/App/App.xcworkspace` (or `.xcodeproj`), then go to target *App* → *Signing & Capabilities*. Check that **Background Modes** is listed with **Location updates** ticked. The Info.plist key is already there; if the capability is missing, add it with **+ Capability → Background Modes → Location updates**. Leave every other mode as it is. Then *File → Packages → Resolve Package Versions*.
3. **Android Studio**: sync Gradle and build. Check the merged manifest (*AndroidManifest.xml → Merged Manifest*): `android.hardware.location.gps` should be `required=false`, and the service `com.capgo.capacitor_background_geolocation.BackgroundGeolocationService` should have `foregroundServiceType=location`.
4. **App Store Connect → App Review Information → Notes**, suggested text:
   > KunThai includes UrRide, a ride-hailing service. Drivers ("operators") switch an "Active" toggle on in the operator dashboard when they are available for rides. Only while Active is on, KunThai uses background location ("Always" / Location updates background mode) so nearby passengers can see and book the driver while the driver's phone is locked or KunThai is in the background — the same way Uber and Bolt drivers stay visible. Before the system prompt, the app explains this in a sheet the driver can decline ("Not now"). Location sharing stops immediately when the driver switches Active off, signs out or switches account. Passengers and other users never have their location used in the background. To test: sign in with the demo operator account [add credentials], open UrRide → Operator dashboard, switch Active on, lock the phone; the account stays listed under "Available near you" for a passenger nearby.
5. **Google Play Console → App content**:
   - **Foreground service permissions** (Android 14+): declare `FOREGROUND_SERVICE_LOCATION`. Use case: *Navigation / ride-hailing*. Explanation: "While a driver is online (Active) in UrRide, a foreground service with a persistent 'KunThai: you're online' notification shares their location so nearby passengers can find and book them. It starts when the driver switches Active on in the app and stops when they go offline or sign out." Add a short video of switching Active on, the notification appearing, and switching off.
   - **Location permissions / background location declaration**: KunThai does **not** request `ACCESS_BACKGROUND_LOCATION`, so the background-location declaration form shouldn't be required. If Play still asks, answer that location is only used in a user-started foreground service with a visible notification.
   - **Data safety**: precise location, collected, shared with other users (passengers see the operator's distance and "last seen near" place), only for UrRide operators while online.

## How to test on a real phone
1. Install a build made after `npx cap sync` on a phone signed in as an operator, and keep a second phone (or the web app) signed in as a passenger nearby. The passenger's country must match the operator's fleet country.
2. Operator: UrRide → Operator dashboard → switch **Active** on.
   - **iPhone**: the sheet appears; tap **Continue**. Choose "Allow While Using App". Later iOS may ask "Change to Always Allow?": choose it, or set it in Settings → KunThai → Location → **Always**. With "While using" the amber hint appears.
   - **Android 13+**: the sheet appears; tap **Continue**, allow location ("While using the app" is enough) and notifications. The "KunThai: you're online" notification appears.
3. Check the green "Visible to passengers · location shared Ns ago" line.
4. Lock the operator's phone (or switch to another app) and **wait 3 minutes** without moving.
5. Passenger: UrRide home → Live Operators → **Available near you**. The operator must still be listed as Available.
   Optional SQL check:
   `select status, last_seen_at, now() - last_seen_at as age from transport_operator_locations where operator_id = '<operator uuid>';`
   `age` should stay below about 40 s while parked.
6. Walk or drive a few hundred metres with the phone locked. The passenger's distance updates.
7. Switch Active off: the notification and iOS's blue indicator disappear, the row becomes `offline`, and the operator leaves the list. Repeat with sign-out and with switching account.
8. Deny location, then open the dashboard: the amber "Location is off for KunThai" hint appears, and **Open settings** opens KunThai's settings.

## Risks and limits
- **Battery and data**: GPS stays on while online, as with any driver app. Writes are throttled: at most one every 6 s while moving (sooner only after 12 m), and one every 30–40 s while parked. Reverse geocoding is unchanged (300 m / 5 min). Operators should go offline when not working. The Android notification and iOS's blue indicator make this obvious.
- **iOS throttling**: iOS keeps KunThai running while location updates are on (`pausesLocationUpdatesAutomatically = false`). Moving operators get fresh callbacks, and those keep JavaScript running. A parked operator relies on the JavaScript heartbeat timer, and iOS/WebKit may slow timers in the background, so check-ins can space out. The plugin has no "periodic low-accuracy fix" option. With "While using" only, background updates keep going as long as sharing started in the foreground, but they end when iOS terminates the app. "Always" is more robust. If the user swipes KunThai away, iOS stops location updates (an OS rule) until the app is opened again.
- **Android WebView networking**: the upserts go through Supabase JS in the WebView. Android may throttle WebView network requests after a long time in the background (`useLegacyBridge` keeps the callbacks coming). If real-device tests show gaps, a follow-up can use the plugin's native `url` POST, which needs a small RPC/edge function and token refresh via `updateHeaders`.
- **Android process restarts**: if Android kills KunThai, the plugin's foreground service may restart with no JavaScript. The notification can then stay up without publishing until KunThai is opened again. The next start stops the old watcher first.
- **Store review**: Apple asks for a clear reason for "Always" plus the Background Modes entitlement (see the note above). Google asks for the foreground-service declaration. A rejection would not affect the web app.
- **Company operators** (`CompanyWorkspaceScreen`): they use the same service and get background sharing when location was already allowed. The explanation sheet, the **Share location** button and the amber hint only exist on the solo operator dashboard, so a company operator who never allowed location gets no prompt from the company workspace. A follow-up can pass `interactive: true` from that screen's availability toggle.
- `src/Backend/services/urridePushDeepLinks.test.js` already fails on main, because it reads a gitignored local migration. It is unrelated to this change.
