import { useState } from "react";
import { HiOutlinePaperAirplane, HiOutlinePhoto, HiOutlineMicrophone } from "react-icons/hi2";

export default function MessageComposer({ onSend }) {
  const [value, setValue] = useState("");

  function submit(event) {
    event.preventDefault();
    const body = value.trim();
    if (!body) return;
    onSend(body);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
      <button type="button" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-500" aria-label="Media messages coming later">
        <HiOutlinePhoto />
      </button>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Write a message..."
        className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none"
      />
      <button type="button" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-500" aria-label="Voice messages coming later">
        <HiOutlineMicrophone />
      </button>
      <button
        type="submit"
        disabled={!value.trim()}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white disabled:bg-slate-200 disabled:text-slate-400"
        aria-label="Send message"
      >
        <HiOutlinePaperAirplane />
      </button>
    </form>
  );
}
