import { Component } from "react";
import { FiCheck, FiCopy, FiMap } from "react-icons/fi";

import { t } from "../../../i18n";
import { describeAreaViewError, rememberAreaViewError } from "./areaViewErrorInfo";

// The first failure is often the screen opening while the app is still
// starting up; one quiet retry usually gets past it without showing the card.
const AUTO_RETRY_DELAY_MS = 600;
// Long enough for "Try again" to visibly do something, even when the map
// fails again straight away.
const MIN_RETRY_FEEDBACK_MS = 700;

const SPINNER = (
  <span
    aria-hidden="true"
    className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
  />
);

// Keeps a Nearby Area failure inside the map screen. Without it, an error in
// the map (for example while it is still starting up) reached the app-wide
// crash screen and forced a full reload.
export default class AreaViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    // phase: "auto" while the quiet first retry runs, "retrying" after a tap
    // on Try again, "card" once the failure is shown.
    this.state = { failed: false, attempt: 0, failures: 0, phase: "auto", error: null, copied: false };
    this.timers = new Set();
  }

  static getDerivedStateFromError(error) {
    return { failed: true, error };
  }

  componentDidCatch(error) {
    console.error("[KunThai] Nearby Area failed", error);
    const failures = this.state.failures + 1;
    rememberAreaViewError(error, failures);
    if (failures === 1) {
      this.setState({ failures, phase: "auto" });
      this.later(AUTO_RETRY_DELAY_MS, this.remount);
      return;
    }
    // A failed retry keeps its spinner for the rest of its minimum time.
    const wait = Math.max(0, (this.retryStartedAt || 0) + MIN_RETRY_FEEDBACK_MS - Date.now());
    this.setState({ failures });
    this.later(wait, () => this.setState({ phase: "card", copied: false }));
  }

  componentDidUpdate(_prevProps, prevState) {
    // A retry that stays up for a moment worked: the next failure, if any,
    // starts from the quiet loading view again rather than a stuck spinner.
    if (!this.state.failed && prevState.failed && this.state.phase === "retrying") {
      this.later(1500, () => {
        if (!this.state.failed) this.setState({ phase: "auto" });
      });
    }
  }

  componentWillUnmount() {
    this.clearTimers();
  }

  later(delay, run) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      run();
    }, delay);
    this.timers.add(id);
  }

  clearTimers() {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers.clear();
  }

  // A new key throws the old tree away, so the map is rebuilt from scratch.
  remount = () => {
    this.setState((state) => ({ failed: false, error: null, attempt: state.attempt + 1 }));
  };

  retry = () => {
    if (this.state.phase === "retrying") return;
    this.clearTimers();
    this.retryStartedAt = Date.now();
    this.setState({ phase: "retrying", copied: false });
    this.later(MIN_RETRY_FEEDBACK_MS, this.remount);
  };

  back = () => {
    this.clearTimers();
    this.setState((state) => ({ failed: false, error: null, failures: 0, phase: "auto", attempt: state.attempt + 1 }));
    this.props.onBack?.();
  };

  copyDetails = async () => {
    const text = describeAreaViewError(this.state.error);
    try {
      await navigator.clipboard?.writeText?.(text);
      this.setState({ copied: true });
      this.later(1800, () => this.setState({ copied: false }));
    } catch {
      // The line is selectable, so it can still be copied by hand.
    }
  };

  render() {
    const { failed, phase, failures, error, copied, attempt } = this.state;
    if (!failed) {
      return <div key={attempt} className="contents">{this.props.children}</div>;
    }

    if (phase === "auto") {
      return (
        <div role="status" aria-live="polite" className="flex h-full min-h-[100dvh] w-full items-center justify-center gap-3 bg-slate-950 p-5 text-sm font-bold text-slate-200">
          {SPINNER}
          <span>{t("urrideMapFix2.opening")}</span>
        </div>
      );
    }

    const retrying = phase === "retrying";
    const details = describeAreaViewError(error);
    return (
      <div className="flex h-full min-h-[100dvh] w-full items-center justify-center bg-slate-950 p-5">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center shadow-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-emerald-300">
            <FiMap size={22} />
          </span>
          <h2 className="mt-3 text-base font-black text-white">{t("urrideAreaFix.title")}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{t("urrideAreaFix.body")}</p>
          {failures > 1 ? (
            <p className="mt-2 text-xs font-bold text-amber-300">{t("urrideMapFix2.attempts", { count: failures })}</p>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={this.back} className="h-11 rounded-xl border border-slate-700 px-4 text-sm font-black text-slate-200 hover:bg-slate-800">
              {t("urrideAreaFix.back")}
            </button>
            <button
              type="button"
              onClick={this.retry}
              disabled={retrying}
              aria-busy={retrying}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-80"
            >
              {retrying ? SPINNER : null}
              <span>{retrying ? t("urrideMapFix2.opening") : t("urrideAreaFix.retry")}</span>
            </button>
          </div>
          {details ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-2 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">{t("urrideMapFix2.errorDetails")}</span>
                <button
                  type="button"
                  onClick={this.copyDetails}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-slate-300 hover:bg-slate-800"
                >
                  {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
                  {copied ? t("urrideMapFix2.copied") : t("urrideMapFix2.copy")}
                </button>
              </div>
              <code dir="ltr" className="mt-1 block select-all break-words font-mono text-[11px] leading-4 text-slate-300">{details}</code>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
