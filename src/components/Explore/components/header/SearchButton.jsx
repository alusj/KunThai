// =====================================
// SearchButton.jsx
// Explore search trigger
// =====================================

import { HiOutlineMagnifyingGlass } from "react-icons/hi2";

export default function SearchButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
      aria-label="Search"
    >
      <HiOutlineMagnifyingGlass />
    </button>
  );
}
