// Header.jsx
// Transport Header Wrapper
// Responsible for layout and positioning of header elements

import OperatorButton from "./Operator/OperatorButton";
import SearchButton from "./searchButton";
import NotificationButton from "./NotificationButton";
import MenuButton from "./MenuButton";
import Radar from "./Radar";

export default function Header() {
  return (
    <header className="w-full bg-white shadow-sm px-4 py-3 flex items-center justify-between">

      {/* Left Section */}
      <div className="flex items-center gap-3">
        <OperatorButton />
        <Radar />
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        <SearchButton />
        <NotificationButton />
        <MenuButton />
      </div>

    </header>
  );
}