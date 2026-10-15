import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

// Notification taps in pushService.js, with Capacitor, Supabase and the screen
// helpers stubbed: a tap that arrives before the app can navigate (cold start,
// signed out) waits and opens exactly once when App reports it is ready.

const WEB = fileURLToPath(new URL("../../../", import.meta.url));

const STUBS = {
  "@capacitor/core": `export const Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };`,
  "@capacitor/push-notifications": `
    export const PushNotifications = {
      addListener: (name, fn) => { (globalThis.__push.listeners[name] ||= []).push(fn); return Promise.resolve({ remove() {} }); },
      checkPermissions: async () => ({ receive: "granted" }),
      createChannel: async () => {},
      register: async () => {},
    };`,
  "@capacitor/app": `export const App = { addListener: () => Promise.resolve({ remove() {} }) };`,
  supabaseClient: `export default { auth: { onAuthStateChange() {}, getSession: async () => ({ data: {} }) }, rpc: async () => ({}), from() { return {}; } };`,
  "i18n/index": `export const t = (key) => key;`,
  notificationBannerService: `
    const log = (...entry) => globalThis.__push.opened.push(entry.join(" "));
    export const requestExploreScreen = (screen) => log("explore", screen);
    export const requestMarketplaceScreen = (screen) => log("urmall", screen || "(home)");
    export const runNotificationAction = (action) => action();
    export const showNotificationBanner = () => true;
    export const wasBannerShownRecently = () => false;`,
  messageService: `export const requestConversationOpen = (id) => globalThis.__push.opened.push("conversation " + id);`,
};

async function loadPushService() {
  const bundle = await build({
    stdin: { contents: 'export * from "./src/Backend/services/pushService.js";', resolveDir: WEB },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ DEV: false, VITE_VAPID_PUBLIC_KEY: "" }) },
    plugins: [{
      name: "stubs",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          const name = Object.keys(STUBS).find((key) => args.path === key || args.path.endsWith(`/${key}`) || args.path.endsWith(`/${key}.js`));
          return name ? { path: name, namespace: "stub" } : undefined;
        });
        builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}

function setupWindow() {
  const events = [];
  globalThis.__push = { listeners: {}, opened: [] };
  globalThis.window = {
    location: { href: "capacitor://localhost/", assign: (url) => events.push(`reload ${url}`) },
    addEventListener() {},
    dispatchEvent: (event) => {
      if (event.type === "kuntai-return-main-page") globalThis.__push.opened.push(`page ${event.detail.page} ${event.detail.target || ""}`.trim());
      return true;
    },
  };
  globalThis.CustomEvent ??= class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  return events;
}

const reloads = setupWindow();
const originalInfo = console.info;
const logs = [];
console.info = (line) => logs.push(String(line));
const push = await loadPushService();
push.initNativePushNotifications();
console.info = originalInfo;
const tap = (route, id = "") => globalThis.__push.listeners.pushNotificationActionPerformed.forEach((fn) => fn({ actionId: "tap", notification: { id, data: route === undefined ? {} : { route } } }));
const opened = () => globalThis.__push.opened.splice(0);

test("the tap listener is registered once, first, at start-up", () => {
  push.initNativePushNotifications();
  assert.equal(globalThis.__push.listeners.pushNotificationActionPerformed.length, 1);
  assert.equal(Object.keys(globalThis.__push.listeners)[0], "pushNotificationActionPerformed");
});

test("cold start: a tap before the app is ready waits, then opens exactly once", () => {
  console.info = (line) => logs.push(String(line));
  tap("orders", "cold-1");
  assert.deepEqual(opened(), [], "nothing opens while loading / signed out");
  push.setNotificationNavigationReady(true);
  assert.deepEqual(opened(), ["urmall orders"]);
  push.setNotificationNavigationReady(false);
  push.setNotificationNavigationReady(true);
  assert.deepEqual(opened(), [], "becoming ready again does not reopen it");
  console.info = originalInfo;
});

test("running / backgrounded: every route opens its screen right away", () => {
  push.setNotificationNavigationReady(true);
  const cases = [
    ["urmall:business", "urmall business"], // New UrMall order (seller)
    ["urmall:business-messages", "urmall business-messages"], // buyer -> seller message
    ["urmall:messages", "urmall messages"], // seller -> buyer message
    ["orders", "urmall orders"], // order / booking update (buyer)
    ["urride", "page transport urride"], // passenger update, operator alert, rental, company activity
    ["urride:trip:t1", "page transport urride:trip:t1"], // passenger update / operator alert
    ["urride:rental:r1", "page transport urride:rental:r1"], // rental request / update
    ["urride:company-dashboard:c1", "page transport urride:company-dashboard:c1"], // company activity
    ["urride:trip:", "page transport urride:trip:"], // no id: UrRide opens its notifications
    ["notifications", "explore Notifications"], // Explore activity
    ["messages", "explore Messages"],
  ];
  cases.forEach(([route, expected], index) => {
    tap(route, `run-${index}`);
    assert.deepEqual(opened(), [expected], route);
  });
  tap("conversation:c1", "run-conv");
  assert.deepEqual(opened(), ["conversation c1", "explore Messages"]);
});

test("the same tap delivered twice navigates once", () => {
  push.setNotificationNavigationReady(true);
  tap("urmall:business", "dup-1");
  tap("urmall:business", "dup-1");
  assert.deepEqual(opened(), ["urmall business"]);
});

test("a second tap while waiting replaces the first; only the latest opens", () => {
  push.setNotificationNavigationReady(false);
  tap("orders", "wait-1");
  tap("urride", "wait-2");
  push.setNotificationNavigationReady(true);
  assert.deepEqual(opened(), ["page transport urride"]);
});

test("malformed or unknown payloads open a safe screen, never nothing", () => {
  push.setNotificationNavigationReady(true);
  tap(undefined, "bad-1");
  tap("", "bad-2");
  tap("totally-unknown:thing", "bad-3");
  tap("urmall:nowhere", "bad-4");
  tap("conversation:", "bad-5");
  assert.deepEqual(opened(), ["explore Notifications", "explore Notifications", "explore Notifications", "urmall (home)", "explore Messages"]);
  assert.deepEqual(reloads, [], "no full-page reload");
});

test("tap logs carry the route kind only", () => {
  const tapLines = logs.filter((line) => line.includes("tap"));
  assert.ok(tapLines.some((line) => line.includes("tap received (native): route=orders")));
  assert.ok(tapLines.some((line) => line.includes("tap waiting")));
  assert.ok(tapLines.some((line) => line.includes("tap opened orders")));
  assert.ok(tapLines.every((line) => !line.includes("cold-1")), "no notification ids in logs");
});
