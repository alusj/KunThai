// Menu.jsx
// Menu controller: manages open/close state

import { useEffect, useState } from "react";
import MenuButton from "./MenuButton";
import MenuDrawer from "./MenuDrawer";

export default function Menu({ badge = 0, onOpenChange, onRequestedScreenHandled, requestedScreen = "" }) {
  // =========================
  // Menu open/close state
  // =========================
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (requestedScreen) setOpen(true);
  }, [requestedScreen]);

  return (
    <>
      {/* Menu icon */}
      <MenuButton badge={badge} onClick={() => setOpen(true)} />

      {/* Menu drawer */}
      <MenuDrawer
        open={open}
        onClose={() => setOpen(false)}
        requestedScreen={requestedScreen}
        onRequestedScreenHandled={onRequestedScreenHandled}
      />
    </>
  );
}
