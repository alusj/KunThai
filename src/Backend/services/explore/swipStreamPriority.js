// The clip being watched gets the connection first.
//
// Swip does three other things with the network while a clip plays: it readies
// the next clip, warms the ones after it, and (iPhone) saves a few clips whole
// to the phone. On a slow connection those took the bandwidth the playing clip
// needed, and it kept stopping to load. They now wait until the playing clip
// has enough ahead of it (or needs no network at all), and step back again the
// moment it has to stop and load.

// Seconds of video ahead of the playhead that count as "safe".
export const CALM_BUFFER_SECONDS = 10;
// After the playing clip had to stop and load, nothing else starts for this long.
export const STALL_QUIET_MS = 8000;

// --- Pure rule (unit tested) --------------------------------------------------

// state: null (nothing is streaming) or
//   { needsNetwork, bufferedAhead, remaining, lastStallAt }
export function isStreamCalm(state, now = Date.now()) {
  if (!state || !state.needsNetwork) return true;
  const remaining = Number(state.remaining);
  const ahead = Number(state.bufferedAhead) || 0;
  // Buffered to its end: the clip needs nothing more.
  if (Number.isFinite(remaining) && remaining > 0 && ahead >= remaining - 0.5) return true;
  if (state.lastStallAt && now - state.lastStallAt < STALL_QUIET_MS) return false;
  return ahead >= CALM_BUFFER_SECONDS;
}

// Seconds buffered ahead of the playhead, and seconds left to play.
export function readBufferState(video) {
  const duration = Number(video?.duration);
  const current = Number(video?.currentTime) || 0;
  let end = current;
  try {
    const ranges = video?.buffered;
    for (let index = 0; index < (ranges?.length || 0); index += 1) {
      if (ranges.start(index) <= current + 0.25 && ranges.end(index) > end) end = ranges.end(index);
    }
  } catch {
    // The player was released.
  }
  return {
    bufferedAhead: Math.max(0, end - current),
    remaining: Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - current) : NaN,
  };
}

// --- Shared state -------------------------------------------------------------

let owner = null; // the clip on screen
let current = null;
let calm = true;
let recheckTimer = null;
const listeners = new Set();

function publish() {
  if (recheckTimer) {
    clearTimeout(recheckTimer);
    recheckTimer = null;
  }
  const next = isStreamCalm(current);
  // A stall's quiet time ends by itself: look again then.
  if (!next && current?.lastStallAt) {
    const wait = STALL_QUIET_MS - (Date.now() - current.lastStallAt);
    if (wait > 0) recheckTimer = setTimeout(publish, wait + 50);
  }
  if (next === calm) return;
  calm = next;
  listeners.forEach((listener) => listener());
}

// The clip on screen says how its stream is doing. `needsNetwork` is false for
// a clip that plays from a file on the phone.
export function reportSwipStream(id, { needsNetwork = true, bufferedAhead = 0, remaining = NaN, stalled = false } = {}) {
  const sameClip = owner === id;
  owner = id;
  current = {
    needsNetwork,
    bufferedAhead,
    remaining,
    lastStallAt: stalled ? Date.now() : (sameClip ? current?.lastStallAt || 0 : 0),
  };
  publish();
}

// The clip left the screen (or Swip closed).
export function endSwipStream(id) {
  if (owner !== id) return;
  owner = null;
  current = null;
  publish();
}

export function swipStreamIsCalm() {
  return calm;
}

export function subscribeSwipStreamCalm(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Resolves true once the playing clip is safe, or false when `cancelled()`
// says the work is no longer wanted (checked each time the state changes and
// once a second).
export function whenSwipStreamCalm(cancelled = () => false) {
  return new Promise((resolve) => {
    if (cancelled()) return resolve(false);
    if (calm) return resolve(true);
    let timer = null;
    const done = (value) => {
      listeners.delete(check);
      clearInterval(timer);
      resolve(value);
    };
    function check() {
      if (cancelled()) done(false);
      else if (calm) done(true);
    }
    listeners.add(check);
    timer = setInterval(check, 1000);
    return undefined;
  });
}
