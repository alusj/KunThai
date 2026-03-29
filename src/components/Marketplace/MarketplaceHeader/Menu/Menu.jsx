// Menu.jsx
// Menu controller: manages open/close state

import { useState } from "react";
import MenuButton from "./MenuButton";
import MenuDrawer from "./MenuDrawer";

export default function Menu() {
  // =========================
  // Menu open/close state
  // =========================
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Menu icon */}
      <MenuButton onClick={() => setOpen(true)} />

      {/* Menu drawer */}
      <MenuDrawer
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
