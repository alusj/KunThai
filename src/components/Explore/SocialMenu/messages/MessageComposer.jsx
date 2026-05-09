import { useEffect, useState } from "react";
import { HiOutlinePaperAirplane, HiOutlinePhoto, HiOutlineMicrophone } from "react-icons/hi2";

function formatRecordingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function MessageComposer({ onActivity, onSend }) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    onActivity?.("recording");
    const interval = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
      onActivity?.("recording");
    }, 1000);

    return () => window.clearInterval(interval);
  }, [onActivity, recording]);

  function submit(event) {
    event.preventDefault();
    const body = value.trim();
    if (!body) return;
    onSend(body);
    onActivity?.("active");
    setValue("");
  }

  function updateValue(nextValue) {
    setValue(nextValue);
    onActivity?.(nextValue.trim() ? "typing" : "active");
  }

  function toggleRecording() {
    setRecording((current) => {
      const next = !current;
      if (next) {
        setRecordingSeconds(0);
      }
      onActivity?.(next ? "recording" : "active");
      return next;
    });
  }

  return (
    <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3">
      {recording ? (
        <div className="mb-2 flex items-center justify-between rounded-2xl bg-rose-50 px-3 py-2 text-sm font-black text-rose-700">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
            Recording voice note
          </span>
          <span>{formatRecordingTime(recordingSeconds)}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
      <button type="button" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-500" aria-label="Media messages coming later">
        <HiOutlinePhoto />
      </button>
      <input
        value={value}
        onChange={(event) => updateValue(event.target.value)}
        placeholder="Write a message..."
        className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none"
      />
      <button
        type="button"
        onClick={toggleRecording}
        className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${recording ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}
        aria-label={recording ? "Stop recording voice note" : "Record voice note"}
      >
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
      </div>
    </form>
  );
}
