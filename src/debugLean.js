// TEMPORARY (2026-11-02): debugging the iPhone restarts. The reload log
// showed iOS ending the page for memory right after Explore was opened from
// UrMall (memory warning, Swip downloading ~9 MB of clips, then a restart).
// With LEAN_DEBUG on, KunThai keeps much less in memory and drops its own
// reloads, so we can see whether the restarts stop:
//   - only the main screen on show is built (App.jsx), none in the background;
//   - Explore builds only its section on show (Explore.jsx);
//   - Swip's start-up clip download is off (swipStartupPrefetch.js);
//   - the 15-minute fresh start is off (quietReload.js and the native apps);
//   - screens switch without the slide animation.
// Set to false to put everything back.
export const LEAN_DEBUG = true;
