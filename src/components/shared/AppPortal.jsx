import { createPortal } from "react-dom";

export default function AppPortal({ children }) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}
