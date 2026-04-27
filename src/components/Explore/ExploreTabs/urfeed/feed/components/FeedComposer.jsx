import { useEffect, useRef, useState } from "react";
import { HiOutlinePaperAirplane, HiOutlineSparkles, HiOutlineXMark } from "react-icons/hi2";

import Avatar from "../../../../shared/Avatar";
import CompactComposer from "../composer/CompactComposer";
import ComposerActions from "../composer/ComposerActions";
import MediaPreview from "../composer/MediaPreview";
import { clearDraft, fileToDataUrl, parseTags, readDraft, writeDraft } from "../composer/composerUtils";

export default function FeedComposer({ profile, creating, onSubmit }) {
  const draft = readDraft();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(draft.body || "");
  const [feedback, setFeedback] = useState("");
  const [imagePreview, setImagePreview] = useState(draft.image_url || "");
  const [videoPreview, setVideoPreview] = useState(draft.video_url || "");
  const [audioPreview, setAudioPreview] = useState(draft.audio_url || "");
  const [audioDuration, setAudioDuration] = useState(draft.audio_duration_seconds || null);
  const [privacy, setPrivacy] = useState(draft.post_privacy || "public");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaMode, setMediaMode] = useState("image");
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const hasContent = Boolean(value.trim() || imagePreview || audioPreview || videoPreview);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.stream) {
        recorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    writeDraft({
      body: value,
      image_url: imagePreview,
      video_url: videoPreview,
      audio_url: audioPreview,
      audio_duration_seconds: audioDuration,
      post_privacy: privacy,
    });
  }, [audioDuration, audioPreview, imagePreview, privacy, value, videoPreview]);

  useEffect(() => {
    function handleCreatePost(event) {
      const type = event.detail?.type || "text";
      openComposer(type);
    }

    window.addEventListener("explore-create-post", handleCreatePost);
    return () => window.removeEventListener("explore-create-post", handleCreatePost);
  }, []);

  function openComposer(type = "text") {
    setOpen(true);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);

    if (type === "image" || type === "video") {
      setMediaMode(type);
      setTimeout(() => fileInputRef.current?.click(), 180);
    }

    if (type === "voice") {
      setTimeout(() => handleAudioClick(), 180);
    }
  }

  async function handleMediaChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const nextPreview = await fileToDataUrl(file);
      if (file.type.startsWith("video/") || mediaMode === "video") {
        setVideoPreview(nextPreview);
        setImagePreview("");
      } else {
        setImagePreview(nextPreview);
        setVideoPreview("");
      }
      setOpen(true);
      setFeedback("");
    } catch (error) {
      setFeedback(error.message || "Unable to attach media.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleAudioClick() {
    setOpen(true);

    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setFeedback("Voice notes are not supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const nextPreview = await fileToDataUrl(new File([blob], "voice-note.webm", { type: blob.type }));
          const seconds = Math.max(1, Math.round(blob.size / 16000));
          setAudioPreview(nextPreview);
          setAudioDuration(seconds);
          setFeedback("");
        } catch (error) {
          setFeedback(error.message || "Unable to save voice note.");
        } finally {
          setIsRecording(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.start();
      setIsRecording(true);
      setFeedback("Recording voice note...");
    } catch (error) {
      setFeedback(error.message || "Unable to access microphone.");
      setIsRecording(false);
    }
  }

  function handleTool(type) {
    if (type === "image" || type === "video") {
      setMediaMode(type);
      fileInputRef.current?.click();
      return;
    }

    if (type === "voice") {
      handleAudioClick();
      return;
    }

    if (type === "tag") {
      setValue((current) => (current.includes("#") ? current : `${current}${current ? " " : ""}#`));
      return;
    }

    setFeedback("Location tagging is coming next.");
  }

  function resetComposer() {
    setValue("");
    setFeedback("");
    setImagePreview("");
    setVideoPreview("");
    setAudioPreview("");
    setAudioDuration(null);
    setPrivacy("public");
    clearDraft();
  }

  async function handleSubmit(event) {
    event?.preventDefault?.();

    if (!hasContent) {
      setOpen(true);
      setFeedback("Add text, an image, a video, or a voice note.");
      return;
    }

    const tags = parseTags(value);
    const result = await onSubmit?.({
      body: value,
      author_name: profile?.displayName || "KunThai User",
      author_username: profile?.username || "user",
      author_avatar_url: profile?.avatarUrl || "",
      user_id: profile?.userId || "",
      image_url: imagePreview,
      audio_url: audioPreview,
      video_url: videoPreview,
      audio_duration_seconds: audioDuration,
      post_privacy: privacy,
      hashtags: tags.hashtags,
      mentions: tags.mentions,
    });

    if (result?.ok) {
      resetComposer();
      setOpen(false);
      return;
    }

    setFeedback(result?.error || "Unable to publish post.");
  }

  return (
    <div ref={composerRef} className="scroll-mt-20">
      <CompactComposer
        profile={profile}
        creating={creating}
        onOpen={openComposer}
        onQuickMedia={openComposer}
        onQuickVoice={handleAudioClick}
        onSubmit={handleSubmit}
      />

      {open ? (
        <div className="fixed inset-0 z-50 flex bg-slate-950/30 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
          <form
            onSubmit={handleSubmit}
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(760px,92vh)] sm:max-w-2xl sm:rounded-[28px]"
          >
            <div className="flex h-16 flex-none items-center justify-between border-b border-slate-100 px-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-700"
                aria-label="Close composer"
              >
                <HiOutlineXMark />
              </button>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Create</p>
                <h2 className="text-base font-black text-slate-950">Explore Post</h2>
              </div>
              <button
                type="submit"
                disabled={creating || !hasContent}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                <HiOutlinePaperAirplane />
                Post
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <Avatar name={profile?.displayName || "KunThai"} src={profile?.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-950">{profile?.displayName || "KunThai User"}</p>
                  <p className="truncate text-sm font-semibold text-slate-500">@{profile?.username || "user"}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <HiOutlineSparkles />
                  Say it your way
                </div>
                <textarea
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setFeedback("");
                  }}
                  autoFocus
                  placeholder="Write a thought, tag someone with @name, or add #topics..."
                  className="min-h-[180px] w-full resize-none bg-transparent text-xl font-semibold leading-8 text-slate-900 outline-none placeholder:text-slate-400 sm:min-h-[220px]"
                />
              </div>

              <MediaPreview
                imagePreview={imagePreview}
                videoPreview={videoPreview}
                audioPreview={audioPreview}
                onRemoveImage={() => setImagePreview("")}
                onRemoveVideo={() => setVideoPreview("")}
                onRemoveAudio={() => {
                  setAudioPreview("");
                  setAudioDuration(null);
                  setFeedback("");
                }}
              />

              {feedback ? (
                <p className={`text-sm font-semibold ${feedback === "Recording voice note..." ? "text-sky-700" : "text-rose-600"}`}>
                  {feedback}
                </p>
              ) : null}
            </div>

            <div className="flex-none space-y-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
              <ComposerActions privacy={privacy} setPrivacy={setPrivacy} isRecording={isRecording} onTool={handleTool} />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={mediaMode === "video" ? "video/*" : "image/*"}
              onChange={handleMediaChange}
              className="hidden"
            />
          </form>
        </div>
      ) : null}
    </div>
  );
}
