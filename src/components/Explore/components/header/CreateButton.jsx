// =====================================
// CreateButton.jsx
// Create post / video button
// =====================================

import { HiOutlinePlus } from "react-icons/hi2";

export default function CreateButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-xl text-white shadow-sm transition hover:bg-sky-700"
      aria-label="Create"
    >
      <HiOutlinePlus />
    </button>
  );
}
