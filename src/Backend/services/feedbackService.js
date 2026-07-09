// Haptic and sound feedback for meaningful app events.
// Web platform limits: vibration only works where navigator.vibrate exists
// (Android Chrome; iOS browsers have no vibration API), and audio can only
// start after the user's first gesture, so the context is primed on the
// first pointer/key interaction. Sounds are synthesized with Web Audio so
// no audio assets are downloaded. Feedback must never break or slow the
// action that triggered it — every entry point swallows its own errors.

import { readExploreSettings } from "./explore/preferencesService";

const HAPTIC_COOLDOWN_MS = 90;
const SOUND_COOLDOWN_MS = 250;

const lastFired = new Map();

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

function vibrate(pattern, module, key) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (!fxSettings().vibration || !moduleAllowed(module)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    if (tooSoon(`haptic:${key}`, HAPTIC_COOLDOWN_MS)) return;
    navigator.vibrate(pattern);
  } catch {
    // Feedback is best-effort only.
  }
}

export const haptics = {
  light(module) {
    vibrate(12, module, "light");
  },
  medium(module) {
    vibrate([16, 30, 24], module, "medium");
  },
  heavy(module) {
    vibrate([35, 60, 35, 60, 45], module, "heavy");
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
