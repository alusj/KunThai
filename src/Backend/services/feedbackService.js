// Haptic and sound feedback for meaningful app events.
// In the iOS / Android app, haptics use the phone's own engine through
// @capacitor/haptics (the Taptic Engine on iPhone). On the web, and in an older
// app build without that plugin, they fall back to navigator.vibrate (Android
// Chrome only; iOS browsers have no vibration API). Audio can only start after
// the user's first gesture, so the context is primed on the first pointer/key
// interaction. Sounds are synthesized with Web Audio so no audio assets are
// downloaded. Feedback must never break or slow the action that triggered
// it — every entry point swallows its own errors.

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

import { readExploreSettings } from "./explore/preferencesService";

const HAPTIC_COOLDOWN_MS = 90;
const SOUND_COOLDOWN_MS = 250;

const lastFired = new Map();
let lastAnyHapticAt = 0;

function tooSoon(key, cooldownMs) {
  const now = Date.now();
  if (now - (lastFired.get(key) || 0) < cooldownMs) return true;
  lastFired.set(key, now);
  return false;
}

function fxSettings() {
  return readExploreSettings().feedbackFx;
}

function moduleAllowed(module) {
  if (!module) return true;
  return fxSettings()[module] !== false;
}

const nativeHaptics = (() => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Haptics");
  } catch {
    return false;
  }
})();

function webVibrationAvailable() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Whether this device can give any haptic feedback (drives the Settings switch). */
export function hapticsSupported() {
  return nativeHaptics || webVibrationAvailable();
}

/** True when any haptic fired at or after `timestamp` (so a toast does not buzz twice). */
export function hapticFiredSince(timestamp) {
  return lastAnyHapticAt >= timestamp;
}

function webVibrate(pattern) {
  try {
    if (webVibrationAvailable()) navigator.vibrate(pattern);
  } catch {
    // Feedback is best-effort only.
  }
}

// `native` runs the phone's haptic; `pattern` is the web/old-build fallback.
function vibrate(pattern, module, key, native) {
  try {
    if (!fxSettings().vibration || !moduleAllowed(module)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    if (tooSoon(`haptic:${key}`, HAPTIC_COOLDOWN_MS)) return;
    lastAnyHapticAt = Date.now();
    if (nativeHaptics && native) {
      Promise.resolve()
        .then(native)
        .catch(() => webVibrate(pattern));
      return;
    }
    webVibrate(pattern);
  } catch {
    // Feedback is best-effort only.
  }
}

const impact = (style) => () => Haptics.impact({ style });
const notify = (type) => () => Haptics.notification({ type });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const haptics = {
  // The smallest tick: toggles, tabs, pickers, chips.
  selection(module) {
    vibrate(6, module, "selection", () => Haptics.selectionChanged());
  },
  light(module) {
    vibrate(12, module, "light", impact(ImpactStyle.Light));
  },
  medium(module) {
    vibrate([16, 30, 24], module, "medium", impact(ImpactStyle.Medium));
  },
  heavy(module) {
    vibrate([35, 60, 35, 60, 45], module, "heavy", impact(ImpactStyle.Heavy));
  },
  // Something finished well (saved, sent, accepted).
  success(module) {
    vibrate([10, 40, 14], module, "success", notify(NotificationType.Success));
  },
  // Something failed.
  error(module) {
    vibrate([40, 50, 40, 50, 40], module, "error", notify(NotificationType.Error));
  },
  // Needs attention, but nothing broke (e.g. "add a photo first").
  warning(module) {
    vibrate([24, 60, 24], module, "warning", notify(NotificationType.Warning));
  },
  // Two distinct buzzes: "you can't do that yet" (e.g. leaving a locked screen).
  doubleShake(module) {
    vibrate([90, 80, 90], module, "doubleShake", notify(NotificationType.Warning));
  },
  // One crisp, strong tick the moment the microphone goes live.
  recordStart(module) {
    vibrate(55, module, "recordStart", impact(ImpactStyle.Heavy));
  },
  // Softer tap when a recording is stopped or discarded.
  recordStop(module) {
    vibrate(14, module, "recordStop", impact(ImpactStyle.Light));
  },
  // A strong triple pulse for one ring of an incoming ride request.
  ring(module) {
    vibrate([300, 150, 300, 150, 300], module, "ring", async () => {
      for (let pulse = 0; pulse < 3; pulse += 1) {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await wait(180);
      }
    });
  },
};

let audioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  if (!audioContext) audioContext = new Context();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext.state === "closed" ? null : audioContext;
}

function primeAudioOnFirstGesture() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    getAudioContext();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

primeAudioOnFirstGesture();

function playTones(notes, module, key) {
  try {
    if (!fxSettings().sounds || !moduleAllowed(module)) return;
    if (tooSoon(`sound:${key}`, SOUND_COOLDOWN_MS)) return;
    const context = getAudioContext();
    if (!context) return;

    let start = context.currentTime;
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type || "sine";
      oscillator.frequency.setValueAtTime(note.from, start);
      if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, start + note.duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.06, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.02);
      start += note.duration + (note.gap ?? 0.04);
    }
  } catch {
    // Feedback is best-effort only.
  }
}

export const sounds = {
  success(module) {
    playTones([{ from: 660, duration: 0.09 }, { from: 880, duration: 0.14 }], module, "success");
  },
  share(module) {
    playTones([{ from: 520, to: 940, duration: 0.16 }], module, "share");
  },
  notification(module) {
    playTones([{ from: 880, duration: 0.07 }, { from: 880, duration: 0.07 }], module, "notification");
  },
  send(module) {
    playTones([{ from: 620, to: 380, duration: 0.11, volume: 0.045 }], module, "send");
  },
  arrival(module) {
    playTones([{ from: 587, duration: 0.09 }, { from: 740, duration: 0.09 }, { from: 880, duration: 0.16 }], module, "arrival");
  },
  // One ring of an incoming ride request: a bright rising two-tone, loud
  // enough to hear in a car.
  ring(module) {
    playTones(
      [
        { from: 784, duration: 0.16, type: "triangle", volume: 0.12 },
        { from: 1047, duration: 0.22, type: "triangle", volume: 0.12 },
        { from: 784, duration: 0.16, type: "triangle", volume: 0.12, gap: 0.12 },
        { from: 1047, duration: 0.22, type: "triangle", volume: 0.12 },
      ],
      module,
      "ring",
    );
  },
  // One "honk ... hoooonk" of the UrRide horn (same pattern as kt_horn.wav,
  // the push sound): a new ride request for operators, "operator arrived" for
  // passengers.
  horn(module) {
    playTones(
      [
        { from: 392, duration: 0.32, type: "sawtooth", volume: 0.09, gap: 0.14 },
        { from: 392, duration: 0.75, type: "sawtooth", volume: 0.09 },
      ],
      module,
      "horn",
    );
    playTones(
      [
        { from: 494, duration: 0.32, type: "sawtooth", volume: 0.07, gap: 0.14 },
        { from: 494, duration: 0.75, type: "sawtooth", volume: 0.07 },
      ],
      module,
      "horn-high",
    );
  },
  emergency(module) {
    playTones(
      [
        { from: 950, duration: 0.14, type: "square", volume: 0.05 },
        { from: 700, duration: 0.14, type: "square", volume: 0.05 },
        { from: 950, duration: 0.14, type: "square", volume: 0.05 },
      ],
      module,
      "emergency",
    );
  },
};

// The horn repeats every 2.2 s (one honk-hoooonk plus a pause) for up to a
// minute, and stops at the first touch or key press: the person has the
// phone in hand.
export const RING_INTERVAL_MS = 2200;
export const RING_MAX_MS = 60000;
let activeRing = null;

function startHornLoop(module) {
  if (activeRing) return stopRinging;
  const ringOnce = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    sounds.horn(module);
    haptics.ring(module);
  };
  ringOnce();
  const interval = window.setInterval(ringOnce, RING_INTERVAL_MS);
  const timeout = window.setTimeout(stopRinging, RING_MAX_MS);
  // Registered after this tick, so the tap that caused the alert (if any)
  // doesn't stop it straight away.
  const onTouch = () => stopRinging();
  const listenTimer = window.setTimeout(() => {
    window.addEventListener("pointerdown", onTouch, true);
    window.addEventListener("keydown", onTouch, true);
  }, 0);
  activeRing = { interval, timeout, listenTimer, onTouch };
  return stopRinging;
}

/**
 * Sounds the UrRide horn (sound + strong vibration, every 2.2 s) for a new
 * ride request reaching an online operator, until the returned stop function
 * is called, the operator touches the screen, or a minute passes. Only one
 * horn runs at a time. Respects the "Ride requests ring" switch plus the usual
 * Sounds, Vibration and UrRide switches.
 */
export function startRinging(module = "transport") {
  try {
    if (fxSettings().rideRequestRing === false || !moduleAllowed(module)) return stopRinging;
    return startHornLoop(module);
  } catch {
    // Feedback is best-effort only.
  }
  return stopRinging;
}

/**
 * The same horn for a passenger whose operator has arrived, with the same
 * stop rules. Respects the usual Sounds, Vibration and UrRide switches (the
 * caller checks the passenger's "Trip alerts" switch).
 */
export function startArrivalHorn(module = "transport") {
  try {
    if (!moduleAllowed(module)) return stopRinging;
    return startHornLoop(module);
  } catch {
    // Feedback is best-effort only.
  }
  return stopRinging;
}

export function stopRinging() {
  if (!activeRing) return;
  window.clearInterval(activeRing.interval);
  window.clearTimeout(activeRing.timeout);
  window.clearTimeout(activeRing.listenTimer);
  window.removeEventListener("pointerdown", activeRing.onTouch, true);
  window.removeEventListener("keydown", activeRing.onTouch, true);
  activeRing = null;
}

export function isRinging() {
  return Boolean(activeRing);
}

const SELECTION_TARGETS = [
  '[role="switch"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(",");

/**
 * One tiny selection tick for every switch, tab, radio and checkbox, plus every
 * <select> change, across the whole app, without each screen wiring it. Buttons
 * that give their own feedback (likes, saves) are not matched. Returns a
 * cleanup function.
 */
export function installSelectionHaptics() {
  if (typeof document === "undefined") return () => {};
  const onClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest(SELECTION_TARGETS) : null;
    if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
    haptics.selection();
  };
  const onChange = (event) => {
    if (event.target instanceof HTMLSelectElement) haptics.selection();
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
  };
}
