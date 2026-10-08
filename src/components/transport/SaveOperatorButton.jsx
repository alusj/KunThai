import { useEffect, useState } from "react";
import { FiCheck, FiHeart } from "react-icons/fi";

import { showToast } from "../../Backend/services/toastService";
import { fetchSavedOperatorFleetIds, getSavedOperators, saveTransportOperator } from "../services/passengerTransportService";
import { useI18n, t } from "../../i18n";
import { shortErrorToast } from "../../Backend/services/friendlyErrorService";

function savedInMemory(fleetId) {
  return Boolean(fleetId && getSavedOperators().some((item) => item.fleetId === fleetId));
}

export default function SaveOperatorButton({ className = "", fleet, label = "", onSaved }) {
  useI18n();
  const fleetId = fleet?.id || "";
  const [saving, setSaving] = useState(false);
  // Start from what is already saved, so a saved operator shows "Saved".
  const [saved, setSaved] = useState(() => savedInMemory(fleetId));

  useEffect(() => {
    let active = true;
    setSaved(savedInMemory(fleetId));
    if (!fleetId) return undefined;
    fetchSavedOperatorFleetIds()
      .then((ids) => { if (active) setSaved(ids.has(fleetId)); })
      .catch(() => {});
    function handleChange(event) {
      const detail = event.detail || {};
      if (detail.fleetId === fleetId) setSaved(detail.action === "saved");
      else if (detail.action === "removed") setSaved(savedInMemory(fleetId));
    }
    window.addEventListener("transport-saved-operator-updated", handleChange);
    return () => {
      active = false;
      window.removeEventListener("transport-saved-operator-updated", handleChange);
    };
  }, [fleetId]);

  async function handleSave(event) {
    event?.stopPropagation?.();
    if (saving || saved || !fleetId) return;

    setSaving(true);
    try {
      const record = await saveTransportOperator(fleet);
      setSaved(true);
      showToast("Operator saved to list", "success");
      onSaved?.(record);
    } catch (error) {
      showToast(shortErrorToast(error, "Couldn't save operator"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving || saved || !fleetId}
      className={className || "kt-touchable flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700"}
    >
      {saved ? <FiCheck size={16} /> : <FiHeart size={16} />}
      {saved ? t("urride.saved.saved") : saving ? t("urride.saved.saving") : label || t("urride.saved.saveOperator")}
    </button>
  );
}
