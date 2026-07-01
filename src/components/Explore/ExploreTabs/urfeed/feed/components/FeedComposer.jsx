import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  HiOutlineAtSymbol,
  HiOutlineHashtag,
  HiOutlineMapPin,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiOutlineXMark,
} from "react-icons/hi2";

import { useBrowserBack } from "../../../../../../Backend/hooks/useBrowserBack";
import {
  MAX_EXPLORE_VIDEO_BYTES,
  removeExploreVideoUpload,
  uploadExploreVideoForReview,
} from "../../../../../../Backend/services/exploreService";
import { publishPostingNotice } from "../../../../../../Backend/services/explore/postingProgressService";
import { searchExplore } from "../../../../../../Backend/services/explore/searchService";
import { readPrivacySettings } from "../../../../../../Backend/services/explore/safetyService";
import { fetchHashtagSuggestions, normalizeHashtag } from "../../../../../../Backend/services/explore/hashtagService";
import { startPendingVideoReviewJob } from "../../../../../../Backend/services/explore/videoReviewService";
import Avatar from "../../../../shared/Avatar";
import { hasAdvertCoordinates } from "../../../../shared/advertUtils";
import AdvertComposerFields from "../composer/AdvertComposerFields";
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
  prepareImageReviewDataUrl,
  readDraft,
  writeDraft,
} from "../composer/composerUtils";
import { runPostReviewPipeline } from "../composer/postReviewPipeline";
import { CONTENT_MODERATION_ENABLED } from "../../../../../../config/contentModeration";
import { getCountryCurrencyCode } from "../../../../../../data/westAfricanCountryProfiles";

const LARGE_VIDEO_BACKGROUND_REVIEW_BYTES = 24 * 1024 * 1024;
const LARGE_VIDEO_INITIAL_REVIEW_TIMEOUT_MS = 18_000;
const VIDEO_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const VIDEO_UPLOAD_PROGRESS_INTERVAL_MS = 1500;
const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
const MAX_POST_TITLE_LENGTH = 30;
const COMPOSER_AREA_RETURN_KEY = "kuntai.explore.composerAreaReturn";
const DEFAULT_ADVERT = {
  setupComplete: false,
  placement: "urfeed",
  objective: "brand_awareness",
  audienceType: "recommended",
  ageRange: "everyone",
  minimumAge: 13,
  maximumAge: 65,
  genderTarget: "all",
  interests: [],
  targetArea: "",
  durationPreset: "14",
  durationDays: 14,
  customStart: "",
  customEnd: "",
  budgetType: "total",
  budgetAmount: "50",
  currency: getCountryCurrencyCode(),
  type: "offer",
  title: "",
  ctaLabel: "Learn more",
  link: "",
  phone: "",
  showPhonePublicly: false,
  address: "",
  date: "",
  time: "",
  lat: null,
  lng: null,
  coordinatesLabel: "",
  source: "",
};

function normalizeAdvertDraft(value = {}) {
  return {
    ...DEFAULT_ADVERT,
    ...(value && typeof value === "object" ? value : {}),
  };
}

function queueComposerAreaReturn(mode) {
  try {
    sessionStorage.setItem(COMPOSER_AREA_RETURN_KEY, mode === "advert" ? "advert" : "post");
  } catch {
    // The saved draft remains available if session storage is unavailable.
  }
}

function consumeComposerAreaReturn() {
  try {
    const mode = sessionStorage.getItem(COMPOSER_AREA_RETURN_KEY);
    sessionStorage.removeItem(COMPOSER_AREA_RETURN_KEY);
    return mode === "advert" || mode === "post" ? mode : "";
  } catch {
    return "";
  }
}

function persistComposerLocationReturn(mode, location) {
  const draft = readDraft();
  const lat = Number(location?.lat ?? location?.latitude);
  const lng = Number(location?.lng ?? location?.longitude);
  const address = location?.address || location?.label || location?.name || formatLocationLabel(lat, lng);
  const coordinatesLabel = location?.coordinatesLabel || formatLocationLabel(lat, lng);

  if (mode === "advert") {
    const advert = normalizeAdvertDraft(draft.media_meta?.advert);
    writeDraft({
      ...draft,
      post_type: "advert",
      post_privacy: "public",
      media_meta: {
        ...(draft.media_meta || {}),
        advert: {
          ...advert,
          address: address || advert.address,
          lat: Number.isFinite(lat) ? lat : advert.lat,
          lng: Number.isFinite(lng) ? lng : advert.lng,
          coordinatesLabel,
          source: location?.source || "areaView",
        },
      },
    });
  } else {
    const { advert: _staleAdvert, ...postMediaMeta } = draft.media_meta || {};
    writeDraft({
      ...draft,
      post_type: "post",
      media_meta: {
        ...postMediaMeta,
        location: {
          label: address || "Tagged location",
          address: address || "Tagged location",
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          coordinatesLabel,
          source: location?.source || "areaView",
        },
      },
    });
  }

  queueComposerAreaReturn(mode);
}

function cleanAdvertForSubmit(advert = {}) {
  const normalized = normalizeAdvertDraft(advert);
  const hasCoordinates = hasAdvertCoordinates(normalized);
  return {
    // Placement remains with the creative as a routing hint for offline and
    // pre-migration clients. Targeting, budget, duration, and delivery state
    // live in the dedicated explore_ad_campaigns record.
    placement: ["urfeed", "swip", "both"].includes(normalized.placement) ? normalized.placement : DEFAULT_ADVERT.placement,
    type: String(normalized.type || DEFAULT_ADVERT.type).trim() || DEFAULT_ADVERT.type,
    title: String(normalized.title || "").trim().slice(0, MAX_POST_TITLE_LENGTH),
    ctaLabel: String(normalized.ctaLabel || DEFAULT_ADVERT.ctaLabel).trim() || DEFAULT_ADVERT.ctaLabel,
    link: String(normalized.link || "").trim(),
    phone: String(normalized.phone || "").trim().slice(0, 32),
    showPhonePublicly: Boolean(String(normalized.phone || "").trim()),
    address: String(normalized.address || "").trim(),
    date: String(normalized.date || "").trim(),
    time: String(normalized.time || "").trim(),
    lat: hasCoordinates ? Number(normalized.lat) : null,
    lng: hasCoordinates ? Number(normalized.lng) : null,
    coordinatesLabel: String(normalized.coordinatesLabel || "").trim(),
    source: String(normalized.source || "").trim(),
  };
}

function cleanAdvertCampaignForSubmit(advert = {}) {
  const normalized = normalizeAdvertDraft(advert);
  return {
    placement: ["urfeed", "swip", "both"].includes(normalized.placement) ? normalized.placement : DEFAULT_ADVERT.placement,
    objective: String(normalized.objective || DEFAULT_ADVERT.objective),
    audienceType: String(normalized.audienceType || DEFAULT_ADVERT.audienceType),
    ageRange: String(normalized.ageRange || DEFAULT_ADVERT.ageRange),
    minimumAge: Math.max(13, Number(normalized.minimumAge) || 13),
    maximumAge: Math.max(13, Number(normalized.maximumAge) || 65),
    genderTarget: String(normalized.genderTarget || DEFAULT_ADVERT.genderTarget),
    interests: Array.isArray(normalized.interests) ? normalized.interests.slice(0, 20) : [],
    targetArea: String(normalized.targetArea || "").trim().slice(0, 80),
    durationPreset: String(normalized.durationPreset || DEFAULT_ADVERT.durationPreset),
    durationDays: Math.max(1, Math.min(Number(normalized.durationDays) || 14, 365)),
    customStart: String(normalized.customStart || ""),
    customEnd: String(normalized.customEnd || ""),
    budgetType: normalized.budgetType === "daily" ? "daily" : "total",
    budgetAmount: Math.max(0, Number(normalized.budgetAmount) || 0),
    currency: String(normalized.currency || "SLE").toUpperCase().slice(0, 5),
  };
}

function formatLocationLabel(lat, lng) {
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return "";
  return `${safeLat.toFixed(6)}, ${safeLng.toFixed(6)}`;
}

async function uploadVideoWithProgress(file, onProgress) {
  let progress = 24;
  let timedOut = false;
  let timeoutId = null;

  const uploadPromise = uploadExploreVideoForReview(file, (bytesUploaded, bytesTotal) => {
    if (!bytesTotal) return;
    const measuredProgress = 24 + Math.round((Math.min(bytesUploaded, bytesTotal) / bytesTotal) * 32);
    progress = Math.max(progress, Math.min(56, measuredProgress));
    onProgress?.(progress);
  });
  uploadPromise
    .then((videoUrl) => {
      if (timedOut && videoUrl) removeExploreVideoUpload(videoUrl).catch(() => {});
    })
    .catch(() => {});

  const progressId = window.setInterval(() => {
    progress = Math.min(56, progress + Math.max(1, Math.ceil((56 - progress) * 0.16)));
    onProgress?.(progress);
  }, VIDEO_UPLOAD_PROGRESS_INTERVAL_MS);

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      reject(new Error("The media upload stopped responding. Check your connection and try publishing again."));
    }, VIDEO_UPLOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([uploadPromise, timeoutPromise]);
  } finally {
    window.clearInterval(progressId);
    window.clearTimeout(timeoutId);
  }
}

export default function FeedComposer({ profile, creating, onSubmit }) {
  const draft = readDraft();
  const privacySettings = readPrivacySettings();

  const [open, setOpen] = useState(false);
  const [composerMode, setComposerMode] = useState(draft.post_type === "advert" ? "advert" : "post");
  const [postTitle, setPostTitle] = useState(String(draft.media_meta?.title || "").slice(0, MAX_POST_TITLE_LENGTH));
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
  const [attachmentMode, setAttachmentMode] = useState(() => (
    draft.video_url ? "video" : draft.image_url ? "image" : "voice"
  ));
  const [mediaMeta, setMediaMeta] = useState(() => {
    if (draft.post_type === "advert") return draft.media_meta || {};
    const { advert: _staleAdvert, ...postMediaMeta } = draft.media_meta || {};
    return postMediaMeta;
  });
  const [advertForm, setAdvertForm] = useState(() => normalizeAdvertDraft(draft.media_meta?.advert));
  const [pendingVideoFile, setPendingVideoFile] = useState(null);
  const [pendingVideoUrl, setPendingVideoUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState(MAX_VIDEO_SECONDS);
  const [trimmingVideo, setTrimmingVideo] = useState(false);
  const [trimError, setTrimError] = useState("");
  const [postingStage, setPostingStage] = useState("");
  const [postingProgress, setPostingProgress] = useState(0);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [hashtagTrigger, setHashtagTrigger] = useState(null);
  const [hashtagSuggestions, setHashtagSuggestions] = useState([]);
  const [hashtagSuggestionsLoading, setHashtagSuggestionsLoading] = useState(false);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const composerScrollRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const trimRequestRef = useRef(0);
  const recordingTimerRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const trimmedVideoMetaRef = useRef(null);
  const originalVideoFileRef = useRef(null);
  const originalImageFileRef = useRef(null);
  const openComposerRef = useRef(null);

  const isAdvertMode = composerMode === "advert";
  const hasContent = Boolean(postTitle.trim() || value.trim() || imagePreview || audioPreview || videoPreview || pendingVideoFile);
  const hasAdvertContent = Boolean(
    isAdvertMode &&
      (advertForm.title.trim() || value.trim() || advertForm.link.trim() || advertForm.phone.trim() || advertForm.address.trim() || imagePreview || videoPreview || pendingVideoFile),
  );
  const hasVideoAttachment = Boolean(videoPreview || pendingVideoFile || pendingVideoUrl);
  const advertPlacementReady = advertForm.placement === "swip"
    ? hasVideoAttachment
    : advertForm.placement === "both"
      ? hasVideoAttachment && Boolean(imagePreview)
      : !hasVideoAttachment || Boolean(imagePreview);
  const canSubmit = isAdvertMode
    ? Boolean(advertForm.setupComplete && hasAdvertContent && advertPlacementReady)
    : hasContent;
  const normalizedTagDraft = normalizeHashtag(tagDraft);
  const visibleHashtagSuggestions = hashtagSuggestions
    .filter((item) => !normalizedTagDraft || item.tag.includes(normalizedTagDraft))
    .slice(0, 12);

  openComposerRef.current = openComposer;

  useEffect(() => {
    const returnMode = consumeComposerAreaReturn();
    if (!returnMode) return;
    setComposerMode(returnMode);
    setOpen(true);
  }, []);

  useBrowserBack(open, () => setOpen(false), "explore-composer");

  useLayoutEffect(() => {
    if (!open) return undefined;

    const scrollToTop = () => composerScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frame);
  }, [composerMode, open]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("kuntai-explore-composer-visibility", {
      detail: { open },
    }));

    return () => {
      if (open) {
        window.dispatchEvent(new CustomEvent("kuntai-explore-composer-visibility", {
          detail: { open: false },
        }));
      }
    };
  }, [open]);

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
    const { advert: _staleAdvert, ...postMediaMeta } = mediaMeta || {};
    writeDraft({
      body: value,
      image_url: imagePreview,
      video_url: videoPreview,
      audio_url: audioPreview,
      audio_duration_seconds: audioDuration,
      post_privacy: isAdvertMode ? "public" : privacy,
      post_type: isAdvertMode ? "advert" : "post",
      media_meta: isAdvertMode
        ? { ...mediaMeta, advert: { ...advertForm } }
        : { ...postMediaMeta, title: postTitle.trim().slice(0, MAX_POST_TITLE_LENGTH) },
    });
  }, [advertForm, audioDuration, audioPreview, imagePreview, isAdvertMode, mediaMeta, postTitle, privacy, value, videoPreview]);

  useEffect(() => {
    function handleCreatePost(event) {
      const type = event.detail?.type || "text";
      openComposerRef.current?.(type);
    }

    window.addEventListener("explore-create-post", handleCreatePost);
    return () => window.removeEventListener("explore-create-post", handleCreatePost);
  }, []);

  useEffect(() => {
    if (!open || isAdvertMode) return undefined;
    let active = true;
    setHashtagSuggestionsLoading(true);
    fetchHashtagSuggestions(profile?.userId || "")
      .then((items) => {
        if (active) setHashtagSuggestions(items);
      })
      .catch(() => {
        if (active) setHashtagSuggestions([]);
      })
      .finally(() => {
        if (active) setHashtagSuggestionsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdvertMode, open, profile?.userId]);

  useEffect(() => {
    let active = true;
    const query = mentionQuery.trim().replace(/^@/, "");

    if (!mentionPickerOpen || !query) {
      setMentionResults([]);
      setMentionLoading(false);
      return undefined;
    }

    setMentionLoading(true);
    const timeout = window.setTimeout(() => {
      searchExplore(`@${query}`, "people")
        .then((results) => {
          if (active) setMentionResults(results.filter((item) => item.type === "people"));
        })
        .catch(() => {
          if (active) setMentionResults([]);
        })
        .finally(() => {
          if (active) setMentionLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [mentionPickerOpen, mentionQuery]);

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
    setComposerMode(type === "advert" ? "advert" : "post");
    setOpen(true);

    if (type === "advert") {
      setAdvertForm((current) => ({
        ...current,
        currency: getCountryCurrencyCode(profile?.countryCode || profile?.country),
      }));
      setFeedback("");
      return;
    }

    if (type === "image" || type === "video") {
      setAttachmentMode(type);
      setMediaMode(type);
      setTimeout(() => fileInputRef.current?.click(), 180);
    }

    if (type === "voice") {
      setAttachmentMode("voice");
    }
  }

  async function handleMediaChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      if (file.type.startsWith("video/") || mediaMode === "video") {
        setAttachmentMode("video");
        if (!isAdvertMode) originalImageFileRef.current = null;
        trimRequestRef.current += 1;
        trimmedVideoMetaRef.current = null;
        cancelVoiceRecording();

        const isSupportedVideo = file.type.startsWith("video/") && (!file.type || SUPPORTED_VIDEO_TYPES.includes(file.type));
        if (!isSupportedVideo) {
          throw new Error("This video format is not supported. Please use MP4, MOV, or WebM.");
        }

        if (file.size > MAX_EXPLORE_VIDEO_BYTES) {
          const sizeMb = Math.max(1, Math.ceil(file.size / (1024 * 1024)));
          throw new Error(`This video is ${sizeMb}MB. KunThai currently accepts videos up to 50MB; compress it and try again.`);
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
        if (!isAdvertMode) setImagePreview("");
        setOpen(true);
        setFeedback("");
        setTrimError("");
        return;
      } else {
        setAttachmentMode("image");
        const nextPreview = await prepareImageReviewDataUrl(file);
        if (!nextPreview) throw new Error("Unable to prepare this image. Please choose it again.");
        originalImageFileRef.current = file;
        const imageMetaPatch = {
          imageName: file.name,
          imageType: file.type,
          imageSize: file.size,
        };

        if (!isAdvertMode) {
          trimRequestRef.current += 1;
          trimmedVideoMetaRef.current = null;
          originalVideoFileRef.current = null;
          setPendingVideoFile(null);
          if (pendingVideoUrl) {
            URL.revokeObjectURL(pendingVideoUrl);
            setPendingVideoUrl("");
          }
          if (videoPreview?.startsWith?.("blob:")) URL.revokeObjectURL(videoPreview);
          setVideoPreview("");
        }
        setImagePreview(nextPreview);
        if (isAdvertMode && trimmedVideoMetaRef.current) {
          trimmedVideoMetaRef.current = { ...trimmedVideoMetaRef.current, ...imageMetaPatch };
        }
        setMediaMeta((current) => ({
          ...current,
          ...imageMetaPatch,
          ...(!isAdvertMode ? { videoName: "", videoType: "", videoSize: 0 } : {}),
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
        ...(!isAdvertMode ? { imageName: "", imageType: "", imageSize: 0 } : {}),
        audioName: "",
        audioType: "",
        audioSize: 0,
      };

      setVideoPreview(sourcePreview);
      if (!isAdvertMode) setImagePreview("");
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

  function appendComposerToken(prefix, rawValue) {
    const normalized = String(rawValue || "")
      .trim()
      .replace(/^[@#]+/, "")
      .replace(/[^a-zA-Z0-9_]/g, "");

    if (!normalized) return;

    const token = `${prefix}${normalized}`;
    setValue((current) => {
      const tokens = current.match(/(?:^|\s)[@#][a-zA-Z0-9_]+/g) || [];
      if (tokens.some((item) => item.trim().toLowerCase() === token.toLowerCase())) return current;
      return `${current.trimEnd()}${current.trim() ? " " : ""}${token} `;
    });
    setFeedback("");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleComposerTextChange(event) {
    const nextValue = event.target.value;
    const cursor = event.target.selectionStart ?? nextValue.length;
    const beforeCursor = nextValue.slice(0, cursor);
    const activeHashtag = beforeCursor.match(/(?:^|\s)#([a-zA-Z0-9_]*)$/);

    setValue(nextValue);
    setFeedback("");

    if (activeHashtag) {
      const query = activeHashtag[1] || "";
      setHashtagTrigger({ start: cursor - query.length - 1, end: cursor });
      setTagDraft(query);
      setTagPickerOpen(true);
      setMentionPickerOpen(false);
      return;
    }

    setMediaMeta((current) => {
      const { advert: _staleAdvert, ...postMediaMeta } = current || {};
      return postMediaMeta;
    });
    if (trimmedVideoMetaRef.current) {
      const { advert: _staleAdvert, ...postVideoMeta } = trimmedVideoMetaRef.current;
      trimmedVideoMetaRef.current = postVideoMeta;
    }

    if (hashtagTrigger) {
      setHashtagTrigger(null);
      setTagPickerOpen(false);
      setTagDraft("");
    }
  }

  function selectHashtag(rawTag) {
    const tag = normalizeHashtag(rawTag);
    if (!tag) return;

    if (hashtagTrigger) {
      const nextCursor = hashtagTrigger.start + tag.length + 2;
      setValue((current) => `${current.slice(0, hashtagTrigger.start)}#${tag} ${current.slice(hashtagTrigger.end)}`);
      window.setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange?.(nextCursor, nextCursor);
      }, 0);
    } else {
      appendComposerToken("#", tag);
    }

    setHashtagTrigger(null);
    setTagDraft("");
    setTagPickerOpen(false);
  }

  function addHashtag() {
    selectHashtag(tagDraft);
  }

  function addMention(profileResult) {
    appendComposerToken("@", profileResult?.username);
    setMentionQuery("");
    setMentionResults([]);
    setMentionPickerOpen(false);
  }

  function handleTool(type) {
    if (type === "image" || type === "video") {
      setAttachmentMode(type);
      setMediaMode(type);
      fileInputRef.current?.click();
      return;
    }

    if (type === "voice") {
      if (hasVideoAttachment) {
        setFeedback("Remove the Swip video before adding a voice note.");
        return;
      }
      setAttachmentMode("voice");
      setFeedback("");
      return;
    }

    if (type === "tag") {
      setTagPickerOpen((current) => !current);
      setMentionPickerOpen(false);
      setFeedback("");
      return;
    }

    if (type === "mention") {
      setMentionPickerOpen((current) => !current);
      setTagPickerOpen(false);
      setFeedback("");
      return;
    }

    if (type === "location") {
      openPostLocationPicker();
    }
  }

  function updateAdvertForm(field, nextValue) {
    const value = field === "title" ? String(nextValue || "").slice(0, MAX_POST_TITLE_LENGTH) : nextValue;
    setAdvertForm((current) => {
      if (field !== "type") return { ...current, [field]: value };

      const shouldSelectApply = value === "job-vacancy" && (!current.ctaLabel || current.ctaLabel === "Learn more");
      const shouldRestoreDefault = current.type === "job-vacancy" && current.ctaLabel === "Apply" && value !== "job-vacancy";
      return {
        ...current,
        type: value,
        ctaLabel: shouldSelectApply ? "Apply" : shouldRestoreDefault ? "Learn more" : current.ctaLabel,
      };
    });
    setFeedback("");
  }

  function openAdvertLocationPicker() {
    queueComposerAreaReturn("advert");
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("kuntai-open-area-view", {
        detail: {
          action: "exploreAdvertLocation",
          autoRoute: false,
          destination: {
            id: "explore-advert-location",
            name: advertForm.title || "Advert location",
            label: advertForm.title || "Advert location",
            address: advertForm.address || "Use Locate Me or Drop Pin to choose the advert location.",
            type: "advert-location",
            status: "private",
          },
          mode: "businessLocationPicker",
          onLocationPicked: (location = {}) => {
            const lat = Number(location.lat ?? location.latitude);
            const lng = Number(location.lng ?? location.longitude);
            const address = location.address || location.label || location.name || formatLocationLabel(lat, lng);

            persistComposerLocationReturn("advert", location);
            setComposerMode("advert");
            setAdvertForm((current) => ({
              ...current,
              address: address || current.address,
              lat: Number.isFinite(lat) ? lat : current.lat,
              lng: Number.isFinite(lng) ? lng : current.lng,
              coordinatesLabel: location.coordinatesLabel || formatLocationLabel(lat, lng),
              source: location.source || "areaView",
            }));
            window.setTimeout(() => {
              setOpen(true);
              setFeedback("");
            }, 120);
          },
          pickerLabels: {
            historyKey: "explore-advert-location-picker",
            backLabel: "Back to advert form",
            eyebrow: "Explore advert",
            headerCurrentTitle: "Use current location",
            headerDropTitle: "Drop a pin",
            cardEyebrow: "Advert location",
            currentHeading: "Use your current location",
            dropHeading: "Place the advert pin",
            dropInstruction: "Move the map until the pin sits on the business, event, pickup point, or service area. Then add the location.",
            currentPreparing: "Your advert location is being prepared.",
            currentStatus: "Confirming your current location...",
            dropStatus: "Move the map until the pin is exactly where customers should go.",
            currentName: "Advert current location",
            droppedName: "Advert pinned location",
          },
          pickerStart: "current",
          returnTo: "explore-advert",
          source: "explore-advert",
        },
      }),
    );
  }

  function openPostLocationPicker() {
    queueComposerAreaReturn("post");
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("kuntai-open-area-view", {
        detail: {
          action: "explorePostLocation",
          autoRoute: false,
          destination: {
            id: "explore-post-location",
            name: mediaMeta.location?.label || "Post location",
            label: mediaMeta.location?.label || "Post location",
            address: mediaMeta.location?.address || "Use Locate Me or Drop Pin to tag this post.",
            type: "post-location",
            status: "private",
          },
          mode: "businessLocationPicker",
          onLocationPicked: (location = {}) => {
            const lat = Number(location.lat ?? location.latitude);
            const lng = Number(location.lng ?? location.longitude);
            const label = location.address || location.label || location.name || formatLocationLabel(lat, lng);

            persistComposerLocationReturn("post", location);
            setComposerMode("post");
            setMediaMeta((current) => ({
              ...current,
              location: {
                label: label || "Tagged location",
                address: label || "Tagged location",
                lat: Number.isFinite(lat) ? lat : null,
                lng: Number.isFinite(lng) ? lng : null,
                coordinatesLabel: location.coordinatesLabel || formatLocationLabel(lat, lng),
                source: location.source || "areaView",
              },
            }));
            window.setTimeout(() => {
              setOpen(true);
              setFeedback("");
            }, 120);
          },
          pickerLabels: {
            historyKey: "explore-post-location-picker",
            backLabel: "Back to post",
            eyebrow: "Explore post",
            headerCurrentTitle: "Use current location",
            headerDropTitle: "Drop a pin",
            cardEyebrow: "Post location",
            currentHeading: "Tag your current location",
            dropHeading: "Place the post pin",
            dropInstruction: "Move the map until the pin marks the place you want attached to this post, then add it.",
            currentPreparing: "Your post location is being prepared.",
            currentStatus: "Confirming your current location...",
            dropStatus: "Move the map until the pin is exactly where you want it.",
            currentName: "Current post location",
            droppedName: "Pinned post location",
          },
          pickerStart: "current",
          returnTo: "explore-post",
          source: "explore-post",
        },
      }),
    );
  }

  function resetComposer() {
    trimRequestRef.current += 1;
    trimmedVideoMetaRef.current = null;
    setPostTitle("");
    setValue("");
    setFeedback("");
    setImagePreview("");
    if (videoPreview?.startsWith?.("blob:")) URL.revokeObjectURL(videoPreview);
    setVideoPreview("");
    setAudioPreview("");
    setAudioDuration(null);
    setMediaMeta({});
    setAttachmentMode("voice");
    setComposerMode("post");
    setAdvertForm(normalizeAdvertDraft());
    setPendingVideoFile(null);
    originalVideoFileRef.current = null;
    originalImageFileRef.current = null;

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
    setTagPickerOpen(false);
    setTagDraft("");
    setMentionPickerOpen(false);
    setMentionQuery("");
    setMentionResults([]);
    setRecordingPaused(false);
    setRecordingSeconds(0);
    stopRecordingTimer();
    setPrivacy(privacySettings.defaultPostPrivacy || "public");
    clearDraft();
  }

  function publishPostingUpdate(detail) {
    publishPostingNotice(detail);
  }

  async function handleSubmit(event) {
    event?.preventDefault?.();

    if (!canSubmit) {
      setOpen(true);
      setFeedback(isAdvertMode ? "Add an advert title, message, link, location, image, or video." : "Add text, an image, a video, or a voice note.");
      return;
    }

    let uploadedReviewVideoUrl = "";

    try {
      let finalVideoPreview = videoPreview;

      if (pendingVideoFile && !finalVideoPreview) {
        finalVideoPreview = await trimPendingVideo(pendingVideoFile, videoTrimStart, videoTrimEnd);

        if (!finalVideoPreview) {
          setOpen(true);
          return;
        }
      }

      const advertMeta = isAdvertMode ? cleanAdvertForSubmit(advertForm) : null;
      const baseMediaMeta = trimmedVideoMetaRef.current || mediaMeta;
      const { advert: _staleAdvert, ...postMediaMeta } = baseMediaMeta || {};
      const finalMediaMeta = {
        ...(isAdvertMode ? baseMediaMeta : postMediaMeta),
        ...(advertMeta ? { advert: advertMeta } : {}),
        ...(!advertMeta ? { title: postTitle.trim().slice(0, MAX_POST_TITLE_LENGTH) } : {}),
      };
      const finalAudioPreview = finalVideoPreview ? "" : audioPreview;
      const finalAudioDuration = finalVideoPreview ? null : audioDuration;

      const postDraft = {
        body: value,
        author_name: profile?.displayName || "Profile",
        author_username: profile?.username || "user",
        author_avatar_url: profile?.avatarUrl || "",
        user_id: profile?.userId || "",
        image_url: isAdvertMode ? imagePreview : finalVideoPreview ? "" : imagePreview,
        image_file: isAdvertMode || !finalVideoPreview ? originalImageFileRef.current : null,
        audio_url: finalAudioPreview,
        video_url: finalVideoPreview,
        audio_duration_seconds: finalAudioDuration,
        post_privacy: isAdvertMode ? "public" : privacy,
        feed_scope: "feed",
        post_type: isAdvertMode ? "advert" : finalVideoPreview ? "video" : "post",
        category: isAdvertMode ? "advert" : finalVideoPreview ? "swip" : "urfeed",
        media_meta: finalMediaMeta,
        mediaMeta: finalMediaMeta,
        advertCampaign: isAdvertMode ? cleanAdvertCampaignForSubmit(advertForm) : null,
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
        const frameSourceUrls = [];

        if (
          CONTENT_MODERATION_ENABLED &&
          originalVideoFileRef.current &&
          Number(originalVideoFileRef.current.size || 0) <= LARGE_VIDEO_BACKGROUND_REVIEW_BYTES
        ) {
          try {
            frameSourceUrls.push(await fileToDataUrl(originalVideoFileRef.current));
          } catch {
            // Fall back to the preview URL below.
          }
        }

        if (CONTENT_MODERATION_ENABLED) {
          frameSourceUrls.push(finalVideoPreview);
        }

        for (const sourceUrl of Array.from(new Set(frameSourceUrls.filter(Boolean)))) {
          try {
            const isMobileVideoDevice =
  /iphone|ipad|ipod|android/i.test(navigator.userAgent || "") ||
  window.innerWidth <= 768;

if (!isMobileVideoDevice) {
  videoFrameDataUrls = await extractVideoFramesFromDataUrl(sourceUrl, 3, {
    start: postDraft.mediaMeta?.videoTrimStart || 0,
    end: postDraft.mediaMeta?.videoTrimEnd || MAX_VIDEO_SECONDS,
  });
} else {
  videoFrameDataUrls = [];
}
          } catch {
            videoFrameDataUrls = [];
          }

          if (videoFrameDataUrls.length) break;
        }

        videoFrameExtractionFailed = CONTENT_MODERATION_ENABLED && videoFrameDataUrls.length === 0;

        if (originalVideoFileRef.current) {
          setPostingStage("uploading-media");
          setPostingProgress(24);
          publishPostingUpdate({
            status: "posting",
            stage: "uploading-media",
            progress: 24,
            message: CONTENT_MODERATION_ENABLED
              ? "Uploading your original video securely before the safety scan."
              : "Uploading your video securely before publishing.",
          });
          uploadedReviewVideoUrl = await uploadVideoWithProgress(originalVideoFileRef.current, (progress) => {
            setPostingProgress(progress);
            publishPostingUpdate({
              status: "posting",
              stage: "uploading-media",
              progress,
              message: "Uploading media securely. Larger videos can take a little longer.",
            });
          });
        }
      }

      const tags = parseTags(postDraft.body);
      const uploadedVideoSize = Number(postDraft.mediaMeta?.videoSize || originalVideoFileRef.current?.size || 0);
      const shouldUseBackgroundReview = Boolean(
        CONTENT_MODERATION_ENABLED &&
        postDraft.video_url &&
        (uploadedVideoSize >= LARGE_VIDEO_BACKGROUND_REVIEW_BYTES || videoFrameExtractionFailed),
      );

      const review = await runPostReviewPipeline({
        body: postDraft.body,
        media: {
          ...postDraft.mediaMeta,
          hasMedia: Boolean(postDraft.image_url || postDraft.video_url || postDraft.audio_url),
          imageDataUrl: postDraft.image_url || "",
          videoDataUrl: "",
          videoUrl: uploadedReviewVideoUrl,
          videoFrameDataUrls,
          videoFrameExtractionFailed,
          videoReviewRequired: Boolean(postDraft.video_url),
          audioDataUrl: postDraft.audio_url || "",
        },
        onStage: (stage, progress) => {
          setPostingStage(stage);
          setPostingProgress(progress);
          publishPostingUpdate({
            status: "posting",
            stage,
            progress,
            message: stage === "media-scan" && postDraft.video_url
              ? "Scanning your original video for KunThai policy violations before publication."
              : undefined,
          });
        },
        reviewTimeoutMs: shouldUseBackgroundReview ? LARGE_VIDEO_INITIAL_REVIEW_TIMEOUT_MS : 0,
      });

      if (!review.ok) {
        if (postDraft.video_url && uploadedReviewVideoUrl && review.retryable) {
          setPostingStage("syncing");
          setPostingProgress(76);
          publishPostingUpdate({
            status: "reviewing",
            stage: "media-scan",
            progress: 76,
            persistent: true,
            message: "Your video is uploaded. KunThai is finishing the full safety review in the background.",
          });

          const pendingResult = await onSubmit?.({
            video_trim_start: postDraft.mediaMeta?.videoTrimStart || 0,
            video_trim_end: postDraft.mediaMeta?.videoTrimEnd || MAX_VIDEO_SECONDS,
            body: postDraft.body,
            author_name: postDraft.author_name,
            author_username: postDraft.author_username,
            author_avatar_url: postDraft.author_avatar_url,
            user_id: postDraft.user_id,
            image_url: postDraft.image_url,
            image_file: postDraft.image_file,
            audio_url: postDraft.audio_url,
            video_url: uploadedReviewVideoUrl,
            video_file: null,
            audio_duration_seconds: postDraft.audio_duration_seconds,
            post_privacy: postDraft.post_privacy,
            hashtags: tags.hashtags,
            mentions: tags.mentions,
            moderation_status: "pending",
            feed_scope: postDraft.feed_scope,
            post_type: postDraft.post_type,
            category: postDraft.category,
            media_meta: postDraft.mediaMeta,
            mediaMeta: postDraft.mediaMeta,
            advert_campaign: postDraft.advertCampaign,
          });

          if (pendingResult?.ok && pendingResult.post?.id) {
            const reviewVideoUrl = uploadedReviewVideoUrl;
            uploadedReviewVideoUrl = "";
            startPendingVideoReviewJob({
              postId: pendingResult.post.id,
              userId: pendingResult.post.user_id || postDraft.user_id,
              videoUrl: reviewVideoUrl,
              body: postDraft.body,
              videoName: postDraft.mediaMeta?.videoName || "",
              videoSize: uploadedVideoSize,
              progress: 80,
              nextRunAt: Date.now() + 24_000,
              message: "Your video is uploaded. KunThai is checking the full file in the background.",
            });
            setOpen(false);
            resetComposer();
            return;
          }

          const pendingMessage = pendingResult?.error || "Unable to save the video while review continues.";
          await removeExploreVideoUpload(uploadedReviewVideoUrl).catch(() => {});
          setPostingStage("");
          setPostingProgress(0);
          setOpen(true);
          setFeedback(pendingMessage);
          publishPostingUpdate({ status: "error", progress: 0, message: pendingMessage });
          return;
        }

        await removeExploreVideoUpload(uploadedReviewVideoUrl).catch(() => {});
        setPostingStage("");
        setPostingProgress(0);
        setOpen(true);
        setFeedback(review.reason);
        publishPostingUpdate({ status: "error", progress: 0, message: review.reason });
        return;
      }

      const uploadedVideoUrl = uploadedReviewVideoUrl || postDraft.video_url;

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
        image_file: postDraft.image_file,
        audio_url: postDraft.audio_url,
        video_url: uploadedVideoUrl,
        video_file: uploadedReviewVideoUrl ? null : postDraft.video_url ? originalVideoFileRef.current : null,
        audio_duration_seconds: postDraft.audio_duration_seconds,
        post_privacy: postDraft.post_privacy,
        hashtags: tags.hashtags,
        mentions: tags.mentions,
        moderation_status: postDraft.video_url ? "approved" : "not_required",
        feed_scope: postDraft.feed_scope,
        post_type: postDraft.post_type,
        category: postDraft.category,
        media_meta: postDraft.mediaMeta,
        mediaMeta: postDraft.mediaMeta,
        advert_campaign: postDraft.advertCampaign,
      });

      if (result?.ok) {
        uploadedReviewVideoUrl = "";
        setPostingStage("complete");
        setPostingProgress(100);

        if (postDraft.video_url && (!isAdvertMode || !postDraft.image_url)) {
          window.dispatchEvent(new CustomEvent("explore-open-tab", { detail: { tab: "Swip", postId: result.post?.id || "" } }));
        }

        publishPostingUpdate({
          status: "complete",
          stage: "complete",
          progress: 100,
          message: result.warning || (isAdvertMode ? "Your sponsored campaign is now live in Explore." : "Your post is now live on Explore."),
        });

        setOpen(false);
        resetComposer();
        return;
      }

      const message = result?.error || (isAdvertMode ? "Unable to publish this advertisement." : "Unable to publish post.");
      await removeExploreVideoUpload(uploadedReviewVideoUrl).catch(() => {});
      setPostingStage("");
      setPostingProgress(0);
      setOpen(true);
      setFeedback(message);
      publishPostingUpdate({ status: "error", progress: 0, message });
    } catch (error) {
      await removeExploreVideoUpload(uploadedReviewVideoUrl).catch(() => {});
      const message = error.message || (isAdvertMode ? "Unable to publish this advertisement. Your draft is still here." : "Unable to publish this post. Your draft is still here.");
      setPostingStage("");
      setPostingProgress(0);
      setOpen(true);
      setFeedback(message);
      publishPostingUpdate({ status: "error", progress: 0, message });
    }
  }

  return (
    <div className="scroll-mt-20">
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
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">{isAdvertMode ? "Promote" : "Create"}</p>
                <h2 className="text-base font-black text-slate-950">{isAdvertMode ? "Advertisement" : "Explore Post"}</h2>
              </div>

              <button
                type="submit"
                disabled={creating || Boolean(postingStage) || !canSubmit}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                <HiOutlinePaperAirplane />
                {postingStage ? "Posting" : isAdvertMode ? "Advert" : "Post"}
              </button>
            </div>

            <div ref={composerScrollRef} data-explore-composer-scroll className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <Avatar name={profile?.displayName || "KunThai"} src={profile?.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-950">{profile?.displayName || "Profile"}</p>
                  <p className="truncate text-sm font-semibold text-slate-500">@{profile?.username || "user"}</p>
                </div>
              </div>

              {isAdvertMode ? (
                <AdvertComposerFields
                  advert={advertForm}
                  imagePreview={imagePreview}
                  onChange={updateAdvertForm}
                  onPickLocation={openAdvertLocationPicker}
                  onSelectMedia={handleTool}
                  pendingVideoFile={pendingVideoFile}
                  videoPreview={videoPreview}
                />
              ) : null}

              {!isAdvertMode || advertForm.setupComplete ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                {!isAdvertMode ? (
                  <label className="mb-4 block border-b border-slate-200 pb-4">
                    <span className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      <span>Post title</span>
                      <span>{postTitle.length}/{MAX_POST_TITLE_LENGTH}</span>
                    </span>
                    <input
                      value={postTitle}
                      maxLength={MAX_POST_TITLE_LENGTH}
                      onChange={(event) => {
                        setPostTitle(event.target.value.slice(0, MAX_POST_TITLE_LENGTH));
                        setFeedback("");
                      }}
                      placeholder="Give your post a short title"
                      className="mt-2 h-11 w-full bg-transparent text-lg font-black text-slate-950 outline-none placeholder:text-slate-400"
                    />
                  </label>
                ) : null}

                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <HiOutlineSparkles />
                  {isAdvertMode ? "Advert message" : "Say it your way"}
                </div>

                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleComposerTextChange}
                  autoFocus={!isAdvertMode}
                  placeholder={isAdvertMode ? "Describe the offer, role, benefit, schedule, or announcement..." : "Write a thought, tag someone with @name, or add #topics..."}
                  className={`w-full resize-none bg-transparent text-xl font-semibold leading-8 text-slate-900 outline-none placeholder:text-slate-400 ${
                    isAdvertMode ? "min-h-[120px] sm:min-h-[150px]" : "min-h-[180px] sm:min-h-[220px]"
                  }`}
                />
                {!isAdvertMode ? (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
                    <button
                      type="button"
                      onClick={() => handleTool("mention")}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition ${
                        mentionPickerOpen ? "bg-violet-600 text-white" : "bg-white text-violet-700 shadow-sm ring-1 ring-violet-100 hover:bg-violet-50"
                      }`}
                    >
                      <HiOutlineAtSymbol className="text-base" /> Mention
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTool("tag")}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition ${
                        tagPickerOpen ? "bg-sky-700 text-white" : "bg-white text-sky-700 shadow-sm ring-1 ring-sky-100 hover:bg-sky-50"
                      }`}
                    >
                      <HiOutlineHashtag className="text-base" /> Hashtag
                    </button>
                  </div>
                ) : null}
              </div>
              ) : null}

              {!isAdvertMode ? (
                <ComposerActions
                  toolsOnly
                  privacy={privacy}
                  setPrivacy={setPrivacy}
                  isRecording={isRecording}
                  hasVideoAttachment={hasVideoAttachment}
                  onTool={handleTool}
                />
              ) : null}

              {!isAdvertMode && tagPickerOpen ? (
                <div className="rounded-[24px] border border-sky-100 bg-sky-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                      <HiOutlineHashtag className="text-base" />
                      Saved topics
                    </div>
                    <span className="text-[11px] font-bold text-slate-500">Choose one or create yours</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={tagDraft}
                      onChange={(event) => setTagDraft(normalizeHashtag(event.target.value))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addHashtag();
                        }
                      }}
                      autoFocus
                      placeholder="Type a hashtag"
                      className="h-11 min-w-0 flex-1 rounded-2xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-sky-300"
                    />
                    <button
                      type="button"
                      onClick={addHashtag}
                      disabled={!tagDraft.trim()}
                      className="h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {normalizedTagDraft && !visibleHashtagSuggestions.some((item) => item.tag === normalizedTagDraft) ? `Create #${normalizedTagDraft}` : "Add"}
                    </button>
                  </div>
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {hashtagSuggestionsLoading ? (
                      <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">Loading saved hashtags...</p>
                    ) : null}
                    {!hashtagSuggestionsLoading && visibleHashtagSuggestions.map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => selectHashtag(item.tag)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm transition hover:bg-sky-50"
                      >
                        <span className="truncate text-sm font-black text-slate-900">#{item.tag}</span>
                        <span className="flex-none rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                          {item.saved && item.personalUsageCount ? `${item.personalUsageCount} your use${item.personalUsageCount === 1 ? "" : "s"}` : `${item.usageCount} use${item.usageCount === 1 ? "" : "s"}`}
                        </span>
                      </button>
                    ))}
                    {!hashtagSuggestionsLoading && !visibleHashtagSuggestions.length ? (
                      <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">
                        {normalizedTagDraft ? `No saved #${normalizedTagDraft} yet. Create it above.` : "Your published hashtags will be saved here with their use count."}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">Typing # in your post opens this list automatically.</p>
                </div>
              ) : null}

              {!isAdvertMode && mentionPickerOpen ? (
                <div className="rounded-[24px] border border-violet-100 bg-violet-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                    <HiOutlineAtSymbol className="text-base" />
                    Mention someone
                  </div>
                  <input
                    value={mentionQuery}
                    onChange={(event) => setMentionQuery(event.target.value.replace(/^@/, ""))}
                    autoFocus
                    placeholder="Search by name or username"
                    className="mt-3 h-11 w-full rounded-2xl border border-violet-100 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-violet-300"
                  />
                  <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                    {mentionLoading ? <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">Finding people...</p> : null}
                    {!mentionLoading && mentionQuery.trim() && !mentionResults.length ? (
                      <p className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-500">No matching Explore profile.</p>
                    ) : null}
                    {mentionResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => addMention(result)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition hover:bg-violet-50"
                      >
                        <Avatar name={result.title || result.username || "Profile"} src={result.avatarUrl} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-950">{result.title}</span>
                          <span className="block truncate text-xs font-bold text-slate-500">@{result.username}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">The selected person will receive a mention notification when this post is published.</p>
                </div>
              ) : null}

              {!isAdvertMode && mediaMeta.location ? (
                <div className="flex items-center gap-3 rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                    <HiOutlineMapPin className="text-xl" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Post location</p>
                    <p className="truncate text-sm font-bold text-slate-800">{mediaMeta.location.label || mediaMeta.location.address}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMediaMeta((current) => {
                      const { location: _location, ...rest } = current;
                      return rest;
                    })}
                    className="grid h-9 w-9 flex-none place-items-center rounded-2xl bg-white text-slate-500"
                    aria-label="Remove post location"
                  >
                    <HiOutlineXMark />
                  </button>
                </div>
              ) : null}

              {!isAdvertMode && attachmentMode === "voice" && !hasVideoAttachment ? (
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

              {!isAdvertMode || advertForm.setupComplete ? (
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
                  originalImageFileRef.current = null;
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
              ) : null}

              {postingStage ? <PostingProgress progress={postingProgress} stage={postingStage} /> : null}

              {feedback ? (
                <p className={`text-sm font-semibold ${feedback === "Recording voice note..." ? "text-sky-700" : "text-rose-600"}`}>
                  {feedback}
                </p>
              ) : null}
            </div>

            <div className="flex-none space-y-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
              <ComposerActions
                privacyOnly={!isAdvertMode}
                privacy={privacy}
                setPrivacy={setPrivacy}
                isRecording={isRecording}
                hasVideoAttachment={hasVideoAttachment}
                advertMode={isAdvertMode}
                advertConfigured={Boolean(advertForm.setupComplete)}
                advertPlacement={advertForm.placement}
                advertAudience={advertForm.audienceType}
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
