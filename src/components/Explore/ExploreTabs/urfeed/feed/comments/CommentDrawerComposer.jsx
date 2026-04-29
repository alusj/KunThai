import { useRef, useState } from "react";
import { HiOutlineMicrophone, HiOutlinePaperAirplane, HiOutlineXMark } from "react-icons/hi2";

import { fileToDataUrl } from "../composer/composerUtils";

export default function CommentDrawerComposer({ onSubmit, replyingTo, onCancelReply }) {
  const [value, setValue] = useState("");
  const [audioPreview, setAudioPreview] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function toggleRecording() {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      setAudioPreview(await fileToDataUrl(new File([blob], "comment-voice.webm", { type: blob.type })));
      setIsRecording(false);
      stream.getTracks().forEach((track) => track.stop());
    };

    recorder.start();
    setIsRecording(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const body = value.trim();

    if (!body && !audioPreview) {
      return;
    }

    await onSubmit?.({
      body,
      audio_url: audioPreview,
      parent_comment_id: replyingTo?.id || null,
    });
    setValue("");
    setAudioPreview("");
    onCancelReply?.();
  }

  return (
    <form onSubmit={handleSubmit} className="kuntai-safe-bottom border-t border-slate-200 bg-white p-3">
      {replyingTo ? (
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
          <span className="truncate">Replying to {replyingTo.author_name || "comment"}</span>
          <button type="button" onClick={onCancelReply} className="flex-none" aria-label="Cancel reply">
            <HiOutlineXMark />
          </button>
        </div>
      ) : null}

      {audioPreview ? (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
          <audio controls src={audioPreview} className="h-10 min-w-0 flex-1" />
          <button type="button" onClick={() => setAudioPreview("")} className="text-slate-500" aria-label="Remove voice comment">
            <HiOutlineXMark />
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Comment with text, @mention, or voice..."
          className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none"
        />
        <button
          type="button"
          onClick={toggleRecording}
          className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${isRecording ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600"}`}
          aria-label={isRecording ? "Stop recording" : "Record voice comment"}
        >
          <HiOutlineMicrophone />
        </button>
        <button
          type="submit"
          disabled={!value.trim() && !audioPreview}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white disabled:bg-slate-200 disabled:text-slate-400"
          aria-label="Send comment"
        >
          <HiOutlinePaperAirplane />
        </button>
      </div>
    </form>
  );
}
