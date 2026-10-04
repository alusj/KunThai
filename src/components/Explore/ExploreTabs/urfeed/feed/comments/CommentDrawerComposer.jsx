import { useEffect, useRef, useState } from "react";
import { HiOutlineMicrophone, HiOutlinePaperAirplane, HiOutlineXMark, HiStop } from "react-icons/hi2";

import { fileToDataUrl } from "../composer/composerUtils";
import { MentionHashtagSuggestions } from "../../../../shared/MentionHashtagAutocomplete";
import { useMentionHashtagAutocomplete } from "../../../../../../Backend/hooks/useMentionHashtagAutocomplete";
import { duckExploreVideos, releaseExploreVideoDuck, voiceCommentAudioHandlers } from "../../../../shared/singleMediaPlayback";

// Ducking key for the mic, shared by every comment composer instance.
const RECORDING_DUCK_KEY = "comment-voice-recording";
import { useI18n, t as translate } from "../../../../../../i18n";
import ExploreAiButton from "../../../../shared/ExploreAiButton";
import { getPostTitle } from "../../../../shared/advertUtils";
import { EXPLORE_COMMENT_ACTIONS } from "../../../../../../Backend/services/ai/aiActionCatalog";
import { haptics } from "../../../../../../Backend/services/feedbackService";
import { LiveRecordingStrip } from "../../../../../shared/recording/LiveRecording";

function getReplyName(comment) {
  const authorName = String(comment?.author_name || comment?.authorProfile?.displayName || "").trim();
  const username = String(comment?.author_username || comment?.authorProfile?.username || "").trim();

  if (authorName && authorName.toLowerCase() !== "profile") return authorName;
  if (username && username.toLowerCase() !== "user") return username;
  return translate("post.thisComment");
}

export default function CommentDrawerComposer({ currentUserId, onSubmit, onSendPreview, post, replyingTo, onCancelReply }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [audioPreview, setAudioPreview] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingStream, setRecordingStream] = useState(null);
  const [recordError, setRecordError] = useState("");
  const [pendingSignature, setPendingSignature] = useState("");
  const recorderRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const chunksRef = useRef([]);
  const inputRef = useRef(null);
  const autocomplete = useMentionHashtagAutocomplete({ value, onValueChange: setValue, inputRef });

  useEffect(() => {
    if (!isRecording) return undefined;
    const startedAt = Date.now();
    const interval = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
  }, []);

  function stopRecording({ discard = false } = {}) {
    if (recorderRef.current?.state !== "recording") return;
    discardRecordingRef.current = discard;
    haptics.recordStop("explore");
    recorderRef.current.stop();
  }

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordError(translate("ui.literals.k703ac149a63c"));
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setRecordError(translate("ui.literals.k616aa6d808cc"));
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorderRef.current = recorder;
    discardRecordingRef.current = false;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      releaseExploreVideoDuck(RECORDING_DUCK_KEY);
      recorderRef.current = null;
      setIsRecording(false);
      setRecordingStream(null);
      if (discardRecordingRef.current) {
        discardRecordingRef.current = false;
        chunksRef.current = [];
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (blob.size) setAudioPreview(await fileToDataUrl(new File([blob], "comment-voice.webm", { type: blob.type })));
    };

    // Quiet (or pause) the video behind the drawer so the mic hears the voice.
    duckExploreVideos(RECORDING_DUCK_KEY, "recording");
    recorder.start();
    setRecordError("");
    setAudioPreview("");
    setRecordingSeconds(0);
    setRecordingStream(stream);
    setIsRecording(true);
    haptics.recordStart("explore");
  }

  // KAI only fills this input. Sending stays the person's own tap.
  function buildAiRequest() {
    const draft = value;
    const replyTarget = replyingTo;
    return {
      screen: replyTarget ? "comment reply" : "post comments",
      title: replyTarget ? t("ai.explore.replyTitle") : t("ai.explore.commentTitle"),
      sourceLabel: t("ai.explore.yourDraft"),
      text: draft,
      actions: EXPLORE_COMMENT_ACTIONS,
      // An empty box goes straight to suggestions; a draft waits for a choice.
      task: draft.trim() ? "" : "explore.reply_suggest",
      hidePrompts: true,
      buildInput: (task) =>
        task === "explore.reply_suggest"
          ? {
              post: { title: getPostTitle(post || {}), body: String(post?.body || "") },
              comment: String(replyTarget?.body || ""),
              draft,
              role: currentUserId && post?.user_id === currentUserId ? "author" : "viewer",
            }
          : {},
      onInsert: (text) => {
        setValue(String(text || ""));
        window.setTimeout(() => inputRef.current?.focus(), 0);
      },
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    const body = value.trim();

    if (!body && !audioPreview) {
      return;
    }

    const signature = [replyingTo?.id || "", body, audioPreview || ""].join("|");
    if (pendingSignature === signature) {
      return;
    }

    const payload = {
      body,
      audio_url: audioPreview,
      parent_comment_id: replyingTo?.id || null,
    };

    setPendingSignature(signature);
    onSendPreview?.(payload);
    const submitPromise = onSubmit?.(payload);
    setValue("");
    setAudioPreview("");
    onCancelReply?.();
    Promise.resolve(submitPromise).finally(() => setPendingSignature((current) => (current === signature ? "" : current)));
  }

  return (
    <form onSubmit={handleSubmit} className="kt-comment-composer kuntai-safe-bottom border-t border-slate-200 bg-white p-3">
      {replyingTo ? (
        <div className="kt-comment-reply-chip mb-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
          <span className="truncate">{t("post.replyingTo", { name: getReplyName(replyingTo) })}</span>
          <button type="button" onClick={onCancelReply} className="kt-pressable flex-none rounded-lg" aria-label={t("post.cancelReply")}>
            <HiOutlineXMark />
          </button>
        </div>
      ) : null}

      {audioPreview ? (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
          <audio
            controls
            src={audioPreview}
            {...voiceCommentAudioHandlers}
            className="h-10 min-w-0 flex-1"
          />
          <button type="button" onClick={() => setAudioPreview("")} className="text-slate-500" aria-label={t("post.removeVoiceComment")}>
            <HiOutlineXMark />
          </button>
        </div>
      ) : null}

      {recordError ? <p className="mb-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{recordError}</p> : null}

      <div className="kt-comment-composer-row relative flex min-w-0 items-center gap-2">
        <MentionHashtagSuggestions
          trigger={autocomplete.trigger}
          results={autocomplete.results}
          loading={autocomplete.loading}
          onSelect={autocomplete.selectSuggestion}
        />
        {isRecording ? (
          <LiveRecordingStrip
            stream={recordingStream}
            seconds={recordingSeconds}
            label={t("explore.recordingVoice")}
            onCancel={() => stopRecording({ discard: true })}
            cancelLabel={t("post.removeVoiceComment")}
          />
        ) : (
        <input
          ref={inputRef}
          value={value}
          onChange={autocomplete.handleInputChange}
          onBlur={() => window.setTimeout(autocomplete.closeSuggestions, 150)}
          placeholder={t("post.commentPlaceholder")}
          className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 outline-none transition-colors duration-150 focus:bg-slate-50 focus:ring-2 focus:ring-sky-100"
        />
        )}
        {isRecording ? null : <ExploreAiButton variant="icon" getRequest={buildAiRequest} label={t("ai.explore.commentAiLabel")} />}
        <button
          type="button"
          onClick={toggleRecording}
          className={`kt-pressable flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-lg ${isRecording ? "kt-rec-button" : "bg-slate-100 text-slate-600"}`}
          aria-label={isRecording ? t("explore.stopRecording") : t("explore.recordVoiceComment")}
        >
          {isRecording ? <HiStop /> : <HiOutlineMicrophone />}
        </button>
        <button
          type="submit"
          disabled={isRecording || (!value.trim() && !audioPreview) || pendingSignature === [replyingTo?.id || "", value.trim(), audioPreview || ""].join("|")}
          className="kt-pressable flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm shadow-slate-950/10 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          aria-label={t("post.sendComment")}
        >
          <HiOutlinePaperAirplane />
        </button>
      </div>
    </form>
  );
}
