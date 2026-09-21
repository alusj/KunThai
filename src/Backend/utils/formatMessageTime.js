function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "12:55 PM" for today, "Jul 16, 12:55 PM" for older messages.
export function formatMessageTime(value, locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  if (isSameDay(date, new Date())) return time;
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })}, ${time}`;
}
