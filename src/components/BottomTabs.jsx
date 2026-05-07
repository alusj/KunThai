// web/src/components/BottomTabs.jsx

import { createElement, useEffect, useRef, useState } from "react";
import { FiCompass, FiShoppingBag, FiTruck } from "react-icons/fi";

const tabs = [
  { id: "explore", label: "Explore", icon: FiCompass },
  { id: "marketplace", label: "Marketplace", icon: FiShoppingBag },
  { id: "transport", label: "Transport", icon: FiTruck },
];

export default function BottomTabs({ page, setPage }) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (y > lastY.current + 8) setHidden(true);
      else if (y < lastY.current - 8) setHidden(false);
      lastY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const Btn = ({ id, label, icon }) => (
    <button
      type="button"
      onClick={() => setPage(id)}
      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 py-2 text-xs select-none ${
        page === id ? "text-blue-600 font-semibold" : "text-gray-600"
      }`}
    >
      {createElement(icon, { size: 21 })}
      <span className="leading-tight">{label}</span>
    </button>
  );

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-white border-t shadow-sm transition-transform duration-300 ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{ zIndex: 50 }}
    >
      <div className="mx-auto grid max-w-5xl grid-cols-3">
        {tabs.map((tab) => (
          <Btn key={tab.id} {...tab} />
        ))}
      </div>
    </nav>
  );
}
