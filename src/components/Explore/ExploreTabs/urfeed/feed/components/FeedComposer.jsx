import { useEffect, useRef, useState } from "react";
import { HiOutlinePaperAirplane, HiOutlineSparkles, HiOutlineXMark } from "react-icons/hi2";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import { readPrivacySettings } from "../../../../../../Backend/services/explore/safetyService";
import Avatar from "../../../../shared/Avatar";
import CompactComposer from "../composer/CompactComposer";
import ComposerActions from "../composer/ComposerActions";
import MediaPreview from "../composer/MediaPreview";
import PostingProgress from "../composer/PostingProgress";
import VoiceCapsuleRecorder from "../composer/VoiceCapsuleRecorder";
import {
  clearDraft,
  extractVideoFramesFromDataUrl,
  fileToDataUrl,
  getVideoDuration,
  MAX_VIDEO_SECONDS,
  parseTags,
  readDraft,
  shouldSkipBrowserVideoProcessing,
  writeDraft,
} from "../composer/composerUtils";
import { runPostReviewPipeline } from "../composer/postReviewPipeline";

const MAX_LOCAL_VIDEO_BYTES = 150 * 1024 * 1024;
const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];

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
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [mediaMode, setMediaMode] = useState("image");
  const [mediaMeta, setMediaMeta] = useState(draft.media_meta || {});
  const [pendingVideoFile, setPendingVideoFile] = useState(null);
  const [pendingVideoUrl, setPendingVideoUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState(MAX_VIDEO_SECONDS);
  const [trimmingVideo, setTrimmingVideo] = useState(false);
  const [trimError, setTrimError] = useState("");
  const [postingStage, setPostingStage] = useState("");
  const [postingProgress, setPostingProgress] = useState(0);

  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const trimRequestRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const trimmedVideoMetaRef = useRef(null);
  const originalVideoFileRef = useRef(null);

  const hasContent = Boolean(value.trim() || imagePreview || audioPreview || videoPreview || pendingVideoFile);
  const hasVideoAttachment = Boolean(videoPreview || pendingVideoFile || pendingVideoUrl);

  useBrowserBack(open, () => setOpen(false), "explore-composer");

  useEffect(() => {
    return () => {
      if (recorderRef.current?.stream) {
        recorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }

      stopRecordingTimer();

      if (pendingVideoUrl) {
        URL.revokeObjectURL(pendingVideoUrl);
      }
    };
  }, [pendingVideoUrl]);

  useEffect(() => {
    return () => {
      if (videoPreview?.startsWith?.("blob:")) {
        URL.revokeObjectURL(videoPreview);
      }
    };
  }, [videoPreview]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startRecordingTimer() {
    window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);
  }

  function stopRecordingTimer() {
    window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  function clearAudioState() {
    setAudioPreview("");
    setAudioDuration(null);
    setRecordingSeconds(0);
    setMediaMeta((current) => ({
      ...current,
      audioName: "",
      audioType: "",
      audioSize: 0,
    }));
  }

  function pauseVoiceRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause();
      setRecordingPaused(true);
      stopRecordingTimer();
    }
  }

  function resumeVoiceRecording() {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume();
      setRecordingPaused(false);
      startRecordingTimer();
    }
  }

  function cancelVoiceRecording() {
    discardRecordingRef.current = true;
    stopRecordingTimer();

    if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") {
      recorderRef.current.stop();
    }

    recorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop());
    recorderRef.current = null;
    chunksRef.current = [];

    setIsRecording(false);
    setRecordingPaused(false);
    clearAudioState();
    setFeedback("");
  }

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

    if (!file) return;

    try {
      trimRequestRef.current += 1;
      trimmedVideoMetaRef.current = null;

      if (file.type.startsWith("video/") || mediaMode === "video") {
        cancelVoiceRecording();

        const isSupportedVideo = file.type.startsWith("video/") && (!file.type || SUPPORTED_VIDEO_TYPES.includes(file.type));
        if (!isSupportedVideo) {
          throw new Error("This video format is not supported. Please use MP4, MOV, or WebM.");
        }

        if (file.size > MAX_LOCAL_VIDEO_BYTES) {
          throw new Error("This video is too large for mobile posting. Please compress it below 150MB and try again.");
        }

        const duration = await getVideoDuration(file);

        if (pendingVideoUrl) URL.revokeObjectURL(pendingVideoUrl);
        if (videoPreview?.startsWith?.("blob:")) URL.revokeObjectURL(videoPreview);

        setPendingVideoFile(file);
        originalVideoFileRef.current = file;
        setPendingVideoUrl(URL.createObjectURL(file));
        setVideoDuration(duration);
        setVideoTrimStart(0);
        setVideoTrimEnd(Math.min(duration || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS));
        setVideoPreview("");
        setImagePreview("");
        setOpen(true);
        setFeedback("");
        setTrimError("");
        return;
      } else {
        const nextPreview = await fileToDataUrl(file);

        originalVideoFileRef.current = null;
        setPendingVideoFile(null);
        if (pendingVideoUrl) {
          URL.revokeObjectURL(pendingVideoUrl);
          setPendingVideoUrl("");
        }
        if (videoPreview?.startsWith?.("blob:")) URL.revokeObjectURL(videoPreview);
        setImagePreview(nextPreview);
        setVideoPreview("");
        trimmedVideoMetaRef.current = null;
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

  function clampTrimWindow(startValue, endValue) {
    const duration = Math.max(0, Number(videoDuration || 0));
    const maxEnd = duration > 0 ? duration : MAX_VIDEO_SECONDS;
    let start = Math.max(0, Math.min(Number(startValue || 0), Math.max(0, maxEnd - 0.5)));
    let end = Math.max(start + 0.5, Number(endValue || start + Math.min(MAX_VIDEO_SECONDS, maxEnd - start)));

    end = Math.min(maxEnd, end);

    if (end - start > MAX_VIDEO_SECONDS) {
      const movingEnd = Number(endValue) !== Number(videoTrimEnd);
      if (movingEnd) {
        start = Math.max(0, end - MAX_VIDEO_SECONDS);
      } else {
        end = Math.min(maxEnd, start + MAX_VIDEO_SECONDS);
      }
    }

    if (end <= start) {
      end = Math.min(maxEnd, start + 0.5);
    }

    return { start, end, seconds: Math.max(0.5, end - start) };
  }

  async function trimPendingVideo(fileOverride = pendingVideoFile, startOverride = videoTrimStart, endOverride = videoTrimEnd) {
    const fileToTrim = fileOverride || pendingVideoFile;

    if (!fileToTrim) return "";

    try {
      const requestId = trimRequestRef.current + 1;
      trimRequestRef.current = requestId;
      setTrimmingVideo(true);
      setTrimError("");
      setFeedback("");

      const { start: safeStart, end: safeEnd, seconds: clipSeconds } = clampTrimWindow(startOverride, endOverride);

      // IMPORTANT MOBILE FIX:
      // Do not run a heavy browser-side video export here. On iPhone/Safari,
      // exporting long videos can crash the tab and cause the blank/reload bug.
      // We keep the original video data and save the selected trim window as metadata;
      // the Swip player then loops only the selected range.
      const sourcePreview = URL.createObjectURL(fileToTrim);

      if (requestId !== trimRequestRef.current) {
        if (sourcePreview && sourcePreview !== pendingVideoUrl) URL.revokeObjectURL(sourcePreview);
        return "";
      }

      const nextVideoMeta = {
        ...mediaMeta,
        videoName: fileToTrim.name || "swip-video.mp4",
        videoType: fileToTrim.type || "video/mp4",
        videoSize: fileToTrim.size || 0,
        videoDuration: videoDuration || clipSeconds,
        videoTrimStart: safeStart,
        videoTrimEnd: safeEnd,
        sourceVideoTrimStart: safeStart,
        sourceVideoTrimEnd: safeEnd,
        imageName: "",
        imageType: "",
        audioName: "",
        audioType: "",
        audioSize: 0,
      };

      setVideoPreview(sourcePreview);
      setImagePreview("");
      setPendingVideoFile(null);
      trimmedVideoMetaRef.current = nextVideoMeta;
      setMediaMeta(nextVideoMeta);

      setPendingVideoUrl("");

      setVideoTrimStart(safeStart);
      setVideoTrimEnd(safeEnd);
      clearAudioState();
      setFeedback(`Swip clip ready: ${clipSeconds.toFixed(1)}s selected.`);
      return sourcePreview;
    } catch (error) {
      if (trimRequestRef.current === 0) return "";
      const message = error.message || "Unable to prepare this clip. Try a shorter section or another video.";
      setTrimError(message);
      setFeedback(message);
      return "";
    } finally {
      setTrimmingVideo(false);
    }
  }

  function chooseTrimPreset(start) {
    const { start: nextStart, end: nextEnd } = clampTrimWindow(start, Number(start) + Math.min(MAX_VIDEO_SECONDS, videoDuration || MAX_VIDEO_SECONDS));
    trimRequestRef.current += 1;
    trimmedVideoMetaRef.current = null;
    setVideoTrimStart(nextStart);
    setVideoTrimEnd(nextEnd);
    setVideoPreview("");
    setTrimError("");
  }

  async function handleAudioClick() {
    setOpen(true);

    if (hasVideoAttachment) {
      setFeedback("Remove the Swip video before adding a voice note.");
      return;
    }

    if (isRecording) {
      discardRecordingRef.current = false;
      stopRecordingTimer();
      setRecordingPaused(false);
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

      discardRecordingRef.current = false;
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          if (discardRecordingRef.current) {
            discardRecordingRef.current = false;
            chunksRef.current = [];
            setFeedback("");
            return;
          }

          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const nextPreview = await fileToDataUrl(new File([blob], "voice-note.webm", { type: blob.type }));
          const seconds = Math.max(1, recordingSeconds || Math.round(blob.size / 16000));

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
          setRecordingPaused(false);
          stopRecordingTimer();
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingPaused(false);
      setRecordingSeconds(0);
      startRecordingTimer();
      setFeedback("Recording voice note...");
    } catch (error) {
      setFeedback(error.message || "Unable to access microphone.");
      setIsRecording(false);
      setRecordingPaused(false);
      stopRecordingTimer();
    }
  }

  function handleTool(type) {
    if (type === "image" || type === "video") {
      setMediaMode(type);
      fileInputRef.current?.click();
      return;
    }

    if (type === "voice") {
      if (hasVideoAttachment) {
        setFeedback("Remove the Swip video before adding a voice note.");
        return;
      }
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
    trimmedVideoMetaRef.current = null;
    setValue("");
    setFeedback("");
    setImagePreview("");
    if (videoPreview?.startsWith?.("blob:")) URL.revokeObjectURL(videoPreview);
    setVideoPreview("");
    setAudioPreview("");
    setAudioDuration(null);
    setMediaMeta({});
    setPendingVideoFile(null);
    originalVideoFileRef.current = null;

    if (pendingVideoUrl) {
      URL.revokeObjectURL(pendingVideoUrl);
      setPendingVideoUrl("");
    }

    setVideoDuration(0);
    setVideoTrimStart(0);
    setVideoTrimEnd(MAX_VIDEO_SECONDS);
    setTrimError("");
    setPostingStage("");
    setPostingProgress(0);
    setRecordingPaused(false);
    setRecordingSeconds(0);
    stopRecordingTimer();
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

    try {
      let finalVideoPreview = videoPreview;

      if (pendingVideoFile && !finalVideoPreview) {
        finalVideoPreview = await trimPendingVideo(pendingVideoFile, videoTrimStart, videoTrimEnd);

        if (!finalVideoPreview) {
          setOpen(true);
          return;
        }
      }

      const finalMediaMeta = trimmedVideoMetaRef.current || mediaMeta;
      const finalAudioPreview = finalVideoPreview ? "" : audioPreview;
      const finalAudioDuration = finalVideoPreview ? null : audioDuration;

      const postDraft = {
        body: value,
        author_name: profile?.displayName || "Profile",
        author_username: profile?.username || "user",
        author_avatar_url: profile?.avatarUrl || "",
        user_id: profile?.userId || "",
        image_url: finalVideoPreview ? "" : imagePreview,
        audio_url: finalAudioPreview,
        video_url: finalVideoPreview,
        audio_duration_seconds: finalAudioDuration,
        post_privacy: privacy,
        mediaMeta: finalMediaMeta,
      };

      setFeedback("");
      setPostingStage("preparing");
      setPostingProgress(5);

      // Move the user back to UrFeed immediately. Review/upload continues below
      // and the app shell can show the small floating publishing card.
      setOpen(false);
      window.dispatchEvent(new CustomEvent("explore-open-tab", { detail: { tab: "UrFeed" } }));

      publishPostingUpdate({
        status: "posting",
        stage: "preparing",
        progress: 5,
        message: "Securing your draft before publishing.",
      });

      let videoFrameDataUrls = [];
      let videoFrameExtractionFailed = false;

      if (finalVideoPreview) {
        try {
          if (!shouldSkipBrowserVideoProcessing()) {
            videoFrameDataUrls = await extractVideoFramesFromDataUrl(finalVideoPreview, 4, {
              start: postDraft.mediaMeta?.videoTrimStart || 0,
              end: postDraft.mediaMeta?.videoTrimEnd || MAX_VIDEO_SECONDS,
            });
          }
        } catch {
          videoFrameDataUrls = [];
        }

        videoFrameExtractionFailed = videoFrameDataUrls.length === 0;
      }

      const review = await runPostReviewPipeline({
        body: postDraft.body,
        media: {
          ...postDraft.mediaMeta,
          hasMedia: Boolean(postDraft.image_url || postDraft.video_url || postDraft.audio_url),
          imageDataUrl: postDraft.image_url || "",
          videoDataUrl: "",
          videoFrameDataUrls,
          videoFrameExtractionFailed,
          videoReviewRequired: Boolean(postDraft.video_url),
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
        setOpen(true);
        setFeedback(review.reason);
        publishPostingUpdate({ status: "error", progress: 0, message: review.reason });
        return;
      }

      const tags = parseTags(postDraft.body);
      const moderationStatus = review.decision === "approved" ? "approved" : "pending";

      setPostingStage("syncing");
      setPostingProgress(92);
      publishPostingUpdate({ status: "posting", stage: "syncing", progress: 92 });

      const result = await onSubmit?.({
        video_trim_start: postDraft.mediaMeta?.videoTrimStart || 0,
        video_trim_end: postDraft.mediaMeta?.videoTrimEnd || MAX_VIDEO_SECONDS,
        body: postDraft.body,
        author_name: postDraft.author_name,
        author_username: postDraft.author_username,
        author_avatar_url: postDraft.author_avatar_url,
        user_id: postDraft.user_id,
        image_url: postDraft.image_url,
        audio_url: postDraft.audio_url,
        video_url: postDraft.video_url,
        video_file: postDraft.video_url ? originalVideoFileRef.current : null,
        audio_duration_seconds: postDraft.audio_duration_seconds,
        post_privacy: postDraft.post_privacy,
        hashtags: tags.hashtags,
        mentions: tags.mentions,
        moderation_status: postDraft.video_url ? moderationStatus : "not_required",
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

        setOpen(false);
        resetComposer();
        return;
      }

      const message = result?.error || "Unable to publish post.";
      setPostingStage("");
      setPostingProgress(0);
      setOpen(true);
      setFeedback(message);
      publishPostingUpdate({ status: "error", progress: 0, message });
    } catch (error) {
      const message = error.message || "Unable to publish this post. Your draft is still here.";
      setPostingStage("");
      setPostingProgress(0);
      setOpen(true);
      setFeedback(message);
      publishPostingUpdate({ status: "error", progress: 0, message });
    }
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

              {!hasVideoAttachment ? (
                <VoiceCapsuleRecorder
                  isRecording={isRecording}
                  isPaused={recordingPaused}
                  duration={recordingSeconds || audioDuration || 0}
                  audioPreview={audioPreview}
                  onStart={handleAudioClick}
                  onStop={handleAudioClick}
                  onPause={pauseVoiceRecording}
                  onResume={resumeVoiceRecording}
                  onCancel={cancelVoiceRecording}
                />
              ) : null}

              <MediaPreview
                imagePreview={imagePreview}
                videoPreview={videoPreview}
                audioPreview={audioPreview}
                pendingVideoUrl={pendingVideoUrl}
                videoDuration={videoDuration}
                videoTrimStart={videoTrimStart}
                videoTrimEnd={videoTrimEnd}
                maxVideoSeconds={MAX_VIDEO_SECONDS}
                trimmingVideo={trimmingVideo}
                trimError={trimError}
                onTrimStartChange={(start) => {
                  const { start: nextStart, end: nextEnd } = clampTrimWindow(start, videoTrimEnd);
                  setVideoTrimStart(nextStart);
                  setVideoTrimEnd(nextEnd);
                  setVideoPreview("");
                  setTrimError("");
                }}
                onTrimEndChange={(end) => {
                  const { start: nextStart, end: nextEnd } = clampTrimWindow(videoTrimStart, end);
                  setVideoTrimStart(nextStart);
                  setVideoTrimEnd(nextEnd);
                  setVideoPreview("");
                  setTrimError("");
                }}
                onTrimPreset={chooseTrimPreset}
                onTrimVideo={() => trimPendingVideo(pendingVideoFile, videoTrimStart, videoTrimEnd)}
                onRetryTrim={() => trimPendingVideo(pendingVideoFile, videoTrimStart, videoTrimEnd)}
                onRemoveImage={() => {
                  setImagePreview("");
                  setMediaMeta((current) => ({ ...current, imageName: "", imageType: "", imageSize: 0 }));
                }}
                onRemoveVideo={() => {
                  trimRequestRef.current += 1;
                  trimmedVideoMetaRef.current = null;
                  originalVideoFileRef.current = null;
                  setVideoPreview("");
                  setPendingVideoFile(null);

                  if (pendingVideoUrl) {
                    URL.revokeObjectURL(pendingVideoUrl);
                    setPendingVideoUrl("");
                  }

                  setVideoDuration(0);
                  setVideoTrimStart(0);
                  setVideoTrimEnd(MAX_VIDEO_SECONDS);
                  setTrimError("");
                  setMediaMeta((current) => ({ ...current, videoName: "", videoType: "", videoSize: 0 }));
                }}
                onRemoveAudio={() => {
                  setAudioPreview("");
                  setAudioDuration(null);
                  setRecordingSeconds(0);
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
              <ComposerActions
                privacy={privacy}
                setPrivacy={setPrivacy}
                isRecording={isRecording}
                hasVideoAttachment={hasVideoAttachment}
                onTool={handleTool}
              />
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
