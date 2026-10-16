import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { isPhoneUsedByAnotherAccount, phoneDigitCount, phoneInUseMessage } from "../services/phoneOwnershipService";

// Live "is this number another account's?" check for a phone field. Runs
// shortly after the person stops typing; `message` is the inline error to
// show while `taken`. `initialPhone` (the saved value when editing) is not
// re-checked, so an existing record never blocks itself.
export default function usePhoneInUse(phone, country, { enabled = true, initialPhone = "", delayMs = 450 } = {}) {
  useI18n();
  const [state, setState] = useState({ status: "idle", value: "" });
  const latest = useRef(0);
  const countryKey = typeof country === "object" ? country?.iso2 || country?.name || "" : country || "";
  const value = String(phone || "").trim();
  const unchanged = Boolean(initialPhone) && value.replace(/\D/g, "") === String(initialPhone).replace(/\D/g, "");

  useEffect(() => {
    const ticket = ++latest.current;
    if (!enabled || unchanged || phoneDigitCount(value) < 7) {
      setState({ status: "idle", value });
      return undefined;
    }
    setState({ status: "checking", value });
    const timer = window.setTimeout(async () => {
      const taken = await isPhoneUsedByAnotherAccount(value, countryKey);
      if (ticket !== latest.current) return;
      setState({ status: taken === true ? "taken" : taken === false ? "free" : "unknown", value });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [value, countryKey, enabled, unchanged, delayMs]);

  const current = state.value === value ? state.status : "idle";
  return {
    taken: current === "taken",
    checking: current === "checking",
    message: current === "taken" ? phoneInUseMessage() : "",
  };
}
