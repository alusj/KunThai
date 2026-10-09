import { Component } from "react";
import { FiMap } from "react-icons/fi";

import { t } from "../../../i18n";

// Keeps a Nearby Area failure inside the map screen. Without it, an error in
// the map (for example while it is still starting up) reached the app-wide
// crash screen and forced a full reload.
export default class AreaViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, attempt: 0 };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[KunThai] Nearby Area failed", error);
  }

  retry = () => {
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
  };

  back = () => {
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
    this.props.onBack?.();
  };

  render() {
    if (!this.state.failed) {
      return <div key={this.state.attempt} className="contents">{this.props.children}</div>;
    }
    return (
      <div className="flex h-full min-h-[100dvh] w-full items-center justify-center bg-slate-950 p-5">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center shadow-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-emerald-300">
            <FiMap size={22} />
          </span>
          <h2 className="mt-3 text-base font-black text-white">{t("urrideAreaFix.title")}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{t("urrideAreaFix.body")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={this.back} className="h-11 rounded-xl border border-slate-700 px-4 text-sm font-black text-slate-200 hover:bg-slate-800">
              {t("urrideAreaFix.back")}
            </button>
            <button type="button" onClick={this.retry} className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500">
              {t("urrideAreaFix.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
