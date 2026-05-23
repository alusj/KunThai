import { useEffect, useRef, useState } from "react";
import { HiOutlinePaperAirplane, HiOutlineSparkles, HiOutlineXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { readPrivacySettings } from "../../../../../../Backend/services/explore/safetyService";
import Avatar from "../../../../shared/Avatar";
import CompactComposer from "../composer/CompactComposer";
import ComposerActions from "../composer/ComposerActions";
import MediaPreview from "../composer/MediaPreview";
import PostingProgress from "../composer/PostingProgress";
import {
  clearDraft,
  fileToDataUrl,
  getVideoDuration,
  MAX_VIDEO_SECONDS,
  parseTags,
  readDraft,
  trimVideoFileToDataUrl,
  writeDraft,
} from "../composer/composerUtils";
import { runPostReviewPipeline } from "../composer/postReviewPipeline";

export default function FeedComposer({ profile, creating, onSubmit }) {
  const draft = readDraft();
  const privacySettings = readPrivacySettings();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(draft.body || "");
  const [feedback, setFeedback] = useState("");
  const [imagePreview, setImagePreview] = useState(draft.image_url || "");
  const [videoPreview, setVideoPreview] = useState(draft.video_url || "");
  const [audioPreview, setAudioPreview] = useState(draft.audio_url || "");
  const [audioDuration, setAudioDuration] = useState(draft.audio_duration_seconds || null);
  const [privacy, setPrivacy] = useState(draft.post_privacy || privacySettings.defaultPostPrivacy || "public");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaMode, setMediaMode] = useState("image");
  const [mediaMeta, setMediaMeta] = useState(draft.media_meta || {});
  const [pendingVideoFile, setPendingVideoFile] = useState(null);
  const [pendingVideoUrl, setPendingVideoUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [trimmingVideo, setTrimmingVideo] = useState(false);
  const [trimError, setTrimError] = useState("");
  const [postingStage, setPostingStage] = useState("");
  const [postingProgress, setPostingProgress] = useState(0);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const trimRequestRef = useRef(0);

  const hasContent = Boolean(value.trim() || imagePreview || audioPreview || videoPreview || pendingVideoFile);

  useBrowserBack(open, () => setOpen(false), "explore-composer");

  useEffect(() => {
    return () => {
      if (recorderRef.current?.stream) {
        recorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      if (pendingVideoUrl) {
        URL.revokeObjectURL(pendingVideoUrl);
      }
    };
  }, [pendingVideoUrl]);

  useEffect(() => {
    writeDraft({
      body: value,
      image_url: imagePreview,
      video_url: videoPreview,
      audio_url: audioPreview,
      audio_duration_seconds: audioDuration,
      post_privacy: privacy,
      media_meta: mediaMeta,
    });
  }, [audioDuration, audioPreview, imagePreview, mediaMeta, privacy, value, videoPreview]);

  useEffect(() => {
    function handleCreatePost(event) {
      const type = event.detail?.type || "text";
      openComposer(type);
    }

    window.addEventListener("explore-create-post", handleCreatePost);
    return () => window.removeEventListener("explore-create-post", handleCreatePost);
    // openComposer uses local refs/state; this event subscription should be registered once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      trimRequestRef.current += 1;
      if (file.type.startsWith("video/") || mediaMode === "video") {
        const duration = await getVideoDuration(file);
        if (duration > MAX_VIDEO_SECONDS) {
          if (pendingVideoUrl) URL.revokeObjectURL(pendingVideoUrl);
          setPendingVideoFile(file);
          setPendingVideoUrl(URL.createObjectURL(file));
          setVideoDuration(duration);
          setVideoTrimStart(0);
          setVideoPreview("");
          setImagePreview("");
          setOpen(true);
          setFeedback("");
          setTrimError("");
          trimPendingVideo(file, 0);
          return;
        }

        const nextPreview = await fileToDataUrl(file);
        setVideoPreview(nextPreview);
        setImagePreview("");
        setPendingVideoFile(null);
        if (pendingVideoUrl) {
          URL.revokeObjectURL(pendingVideoUrl);
          setPendingVideoUrl("");
        }
        setVideoDuration(duration);
        setTrimError("");
        setMediaMeta((current) => ({
          ...current,
          videoName: file.name,
          videoType: file.type,
          videoSize: file.size,
          imageName: "",
          imageType: "",
        }));
      } else {
        const nextPreview = await fileToDataUrl(file);
        setImagePreview(nextPreview);
        setVideoPreview("");
        setMediaMeta((current) => ({
          ...current,
          imageName: file.name,
          imageType: file.type,
          imageSize: file.size,
          videoName: "",
          videoType: "",
        }));
      }
      setOpen(true);
      setFeedback("");
    } catch (error) {
      setFeedback(error.message || "Unable to attach media.");
    } finally {
      event.target.value = "";
    }
  }

  async function trimPendingVideo(fileOverride = pendingVideoFile, startOverride = videoTrimStart) {
    const fileToTrim = fileOverride || pendingVideoFile;
    if (!fileToTrim) {
      return;
    }

    try {
      const requestId = trimRequestRef.current + 1;
      trimRequestRef.current = requestId;
      setTrimmingVideo(true);
      setTrimError("");
      setFeedback("");
      const trimmedPreview = await trimVideoFileToDataUrl(fileToTrim, startOverride, MAX_VIDEO_SECONDS);
      if (requestId !== trimRequestRef.current) {
        return "";
      }
      setVideoPreview(trimmedPreview);
      setImagePreview("");
      setMediaMeta((current) => ({
        ...current,
        videoName: `trimmed-${fileToTrim.name || "swip-video.webm"}`,
        videoType: trimmedPreview.startsWith("data:video/mp4") ? "video/mp4" : "video/webm",
        videoSize: 0,
        videoDuration: MAX_VIDEO_SECONDS,
        imageName: "",
        imageType: "",
      }));
      setFeedback("");
      return trimmedPreview;
    } catch (error) {
      if (trimRequestRef.current === 0) {
        return "";
      }
      setTrimError(error.message || "Unable to prepare this clip. Try again or choose a shorter video.");
      return "";
    } finally {
      setTrimmingVideo(false);
    }
  }

  function chooseTrimPreset(start) {
    const nextStart = Math.max(0, Math.min(start, Math.max(0, videoDuration - MAX_VIDEO_SECONDS)));
    trimRequestRef.current += 1;
    setVideoTrimStart(nextStart);
    setVideoPreview("");
    setTrimError("");
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
          setMediaMeta((current) => ({
            ...current,
            audioName: "voice-note.webm",
            audioType: blob.type,
            audioSize: blob.size,
          }));
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
    trimRequestRef.current += 1;
    setValue("");
    setFeedback("");
    setImagePreview("");
    setVideoPreview("");
    setAudioPreview("");
    setAudioDuration(null);
    setMediaMeta({});
    setPendingVideoFile(null);
    if (pendingVideoUrl) {
      URL.revokeObjectURL(pendingVideoUrl);
      setPendingVideoUrl("");
    }
    setVideoDuration(0);
    setVideoTrimStart(0);
    setTrimError("");
    setPostingStage("");
    setPostingProgress(0);
    setPrivacy(privacySettings.defaultPostPrivacy || "public");
    clearDraft();
  }

  function publishPostingUpdate(detail) {
    window.dispatchEvent(new CustomEvent("explore-posting-update", { detail }));
  }

  async function handleSubmit(event) {
    event?.preventDefault?.();

    if (!hasContent) {
      setOpen(true);
      setFeedback("Add text, an image, a video, or a voice note.");
      return;
    }

    let finalVideoPreview = videoPreview;
    if (pendingVideoFile && !finalVideoPreview) {
      finalVideoPreview = await trimPendingVideo(pendingVideoFile, videoTrimStart);
      if (!finalVideoPreview) {
        setOpen(true);
        return;
      }
    }

    const postDraft = {
      body: value,
      author_name: profile?.displayName || "Profile",
      author_username: profile?.username || "user",
      author_avatar_url: profile?.avatarUrl || "",
      user_id: profile?.userId || "",
      image_url: imagePreview,
      audio_url: audioPreview,
      video_url: finalVideoPreview,
      audio_duration_seconds: audioDuration,
      post_privacy: privacy,
      mediaMeta,
    };

    setFeedback("");
    setPostingStage("preparing");
    setPostingProgress(5);
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    publishPostingUpdate({
      status: "posting",
      stage: "preparing",
      progress: 5,
      message: "Securing your draft before publishing.",
    });

    const review = await runPostReviewPipeline({
  body: postDraft.body,
  media: {
    ...postDraft.mediaMeta,

    hasMedia: Boolean(
      postDraft.image_url ||
      postDraft.video_url ||
      postDraft.audio_url
    ),

    imageDataUrl: postDraft.image_url || "",
    videoDataUrl: postDraft.video_url || "",
    audioDataUrl: postDraft.audio_url || "",
  },

      onStage: (stage, progress) => {
        setPostingStage(stage);
        setPostingProgress(progress);
        publishPostingUpdate({ status: "posting", stage, progress });
      },
    });

    if (!review.ok) {
      setPostingStage("");
      setPostingProgress(0);
      setFeedback(review.reason);
      publishPostingUpdate({ status: "error", progress: 0, message: review.reason });
      return;
    }

    const tags = parseTags(postDraft.body);
    setPostingStage("syncing");
    setPostingProgress(92);
    publishPostingUpdate({ status: "posting", stage: "syncing", progress: 92 });

    const result = await onSubmit?.({
      body: postDraft.body,
      author_name: postDraft.author_name,
      author_username: postDraft.author_username,
      author_avatar_url: postDraft.author_avatar_url,
      user_id: postDraft.user_id,
      image_url: postDraft.image_url,
      audio_url: postDraft.audio_url,
      video_url: postDraft.video_url,
      audio_duration_seconds: postDraft.audio_duration_seconds,
      post_privacy: postDraft.post_privacy,
      hashtags: tags.hashtags,
      mentions: tags.mentions,
    });

    if (result?.ok) {
      setPostingStage("complete");
      setPostingProgress(100);
      if (postDraft.video_url) {
        window.dispatchEvent(new CustomEvent("explore-open-tab", { detail: { tab: "Swip" } }));
      }
      publishPostingUpdate({
        status: "complete",
        stage: "complete",
        progress: 100,
        message: result.warning || "Your post is now live on Explore.",
      });
      resetComposer();
      return;
    }

    setPostingStage("");
    setPostingProgress(0);
    setFeedback(result?.error || "Unable to publish post.");
    publishPostingUpdate({ status: "error", progress: 0, message: result?.error || "Unable to publish post." });
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
                disabled={creating || Boolean(postingStage) || !hasContent}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                <HiOutlinePaperAirplane />
                {postingStage ? "Posting" : "Post"}
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <Avatar name={profile?.displayName || "KunThai"} src={profile?.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-950">{profile?.displayName || "Profile"}</p>
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
                pendingVideoUrl={pendingVideoUrl}
                videoDuration={videoDuration}
                videoTrimStart={videoTrimStart}
                maxVideoSeconds={MAX_VIDEO_SECONDS}
                trimmingVideo={trimmingVideo}
                trimError={trimError}
                onTrimStartChange={(start) => {
                  setVideoTrimStart(start);
                  setVideoPreview("");
                  setTrimError("");
                }}
                onTrimPreset={chooseTrimPreset}
                onTrimVideo={trimPendingVideo}
                onRetryTrim={() => trimPendingVideo(pendingVideoFile, videoTrimStart)}
                onRemoveImage={() => {
                  setImagePreview("");
                  setMediaMeta((current) => ({ ...current, imageName: "", imageType: "", imageSize: 0 }));
                }}
                onRemoveVideo={() => {
                  trimRequestRef.current += 1;
                  setVideoPreview("");
                  setPendingVideoFile(null);
                  if (pendingVideoUrl) {
                    URL.revokeObjectURL(pendingVideoUrl);
                    setPendingVideoUrl("");
                  }
                  setVideoDuration(0);
                  setVideoTrimStart(0);
                  setTrimError("");
                  setMediaMeta((current) => ({ ...current, videoName: "", videoType: "", videoSize: 0 }));
                }}
                onRemoveAudio={() => {
                  setAudioPreview("");
                  setAudioDuration(null);
                  setMediaMeta((current) => ({ ...current, audioName: "", audioType: "", audioSize: 0 }));
                  setFeedback("");
                }}
              />

              {postingStage ? <PostingProgress progress={postingProgress} stage={postingStage} /> : null}

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
