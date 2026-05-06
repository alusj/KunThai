const ACCOUNT_KEY = "kuntai.transport.operatorAccount";
const DRAFT_KEY = "kuntai.transport.operatorDraft";

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function getOperatorAccount() {
  return safeParse(localStorage.getItem(ACCOUNT_KEY));
}

export function saveOperatorAccount(account) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  localStorage.removeItem(DRAFT_KEY);
  return account;
}

export function getOperatorDraft() {
  return safeParse(localStorage.getItem(DRAFT_KEY));
}

export function saveOperatorDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

export function clearOperatorAccount() {
  localStorage.removeItem(ACCOUNT_KEY);
}
