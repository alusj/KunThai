import { Component } from "react";

import { isChunkLoadError } from "../../Backend/utils/lazyWithRetry";

// Wraps the lazily-loaded main pages. A transient chunk-load failure is held on
// the normal loading fallback and retried automatically — immediately when the
// network returns, otherwise on a short backoff — so the app shell and the
// surrounding view are never replaced by a full-screen error. Genuine render
// errors are re-thrown so the root boundary can still handle a real crash.
export default class LazyRouteBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retryTimer = null;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidMount() {
    window.addEventListener("online", this.handleOnline);
  }

  componentDidUpdate(_prevProps, prevState) {
    if (this.state.error && this.state.error !== prevState.error && isChunkLoadError(this.state.error)) {
      this.retryTimer = window.setTimeout(this.recover, 2500);
    }
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.handleOnline);
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
  }

  handleOnline = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) this.recover();
  };

  // Clear the error and ask the parent to re-create the lazy modules — React
  // caches a failed lazy import, so a fresh import factory is what actually
  // retries the download.
  recover = () => {
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.setState({ error: null });
    this.props.onRecover?.();
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (!isChunkLoadError(error)) throw error; // a real crash → let the root boundary show
      return this.props.fallback ?? null; // stay on the loading UI while we retry
    }
    return this.props.children;
  }
}
