// The dashboard an operator chose (solo, or company + which company), kept
// per account on this device so it survives closing and reopening the app
// until they switch again. Storage is best-effort: without it the solo fleet
// shows first.
const OPERATOR_WORK_MODE_PREFIX = "kunthai.urride.operatorWorkMode.v1:";
const OPERATOR_WORK_COMPANY_PREFIX = "kunthai.urride.operatorWorkCompany.v1:";

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readOperatorWorkMode(userId = "") {
  if (!userId) return "";
  try {
    const value = storage()?.getItem(`${OPERATOR_WORK_MODE_PREFIX}${userId}`) || "";
    return value === "company" || value === "solo" ? value : "";
  } catch {
    return "";
  }
}

export function readOperatorWorkCompany(userId = "") {
  if (!userId) return "";
  try {
    return storage()?.getItem(`${OPERATOR_WORK_COMPANY_PREFIX}${userId}`) || "";
  } catch {
    return "";
  }
}

export function saveOperatorWorkChoice(userId = "", mode = "", companyId = "") {
  if (!userId) return;
  const store = storage();
  if (!store) return;
  try {
    if (mode === "company" || mode === "solo") store.setItem(`${OPERATOR_WORK_MODE_PREFIX}${userId}`, mode);
    else store.removeItem(`${OPERATOR_WORK_MODE_PREFIX}${userId}`);
    // Switching to solo keeps the last company, so "Company" returns to it.
    if (mode === "company" && companyId) store.setItem(`${OPERATOR_WORK_COMPANY_PREFIX}${userId}`, companyId);
  } catch {
    // Only a convenience.
  }
}
