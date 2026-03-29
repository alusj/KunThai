// src/explore/connections/Connections.jsx
import { useState } from "react";
import MyCircle from "./myCircle/MyCircle";
import Discover from "./discover/Discover";

export default function Connections() {
  const [tab, setTab] = useState("mycircle");

  return (
    <div className="w-full">

      {/* FULL-WIDTH CHILD TABS */}
      <div className="flex border-b">
        <button
          onClick={() => setTab("mycircle")}
          className={`flex-1 py-3 text-sm font-medium text-center
            ${tab === "mycircle"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
            }`}
        >
          My Circle
        </button>

        <button
          onClick={() => setTab("discover")}
          className={`flex-1 py-3 text-sm font-medium text-center
            ${tab === "discover"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500"
            }`}
        >
          Discover
        </button>
      </div>

      {/* TAB CONTENT */}
      {tab === "mycircle" && <MyCircle />}
      {tab === "discover" && <Discover />}
    </div>
  );
}
