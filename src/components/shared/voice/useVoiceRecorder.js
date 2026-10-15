import { useCallback, useEffect, useRef, useState } from "react";

import { haptics } from "../../../Backend/services/feedbackService";
import { t } from "../../../i18n/index";
import { pickVoiceMimeType } from "./voiceNoteModel";

const MAX_SECONDS = 5 * 60;
const MIN_SECONDS = 1;

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read the recording."));
    reader.readAsDataURL(blob);
  });
}

export function voiceRecordingSupported() {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";
}

/**
 * The one voice-note recorder for every chat (Explore and UrMall). It records
 * in the most widely playable format the device offers (MP4/AAC before WebM),
 * stops by itself after 5 minutes, and hands back a data: URL to send.
 *
 * onRecorded({ dataUrl, mimeType, seconds }) runs after a recording is kept;
 * onError(message) gets a translated, user-facing reason.
 */
export function useVoiceRecorder({ module = "messages", onRecorded, onError, onActivity } = {}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [stream, setStream] = useState(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const secondsRef = useRef(0);
  const discardRef = useRef(false);
  const timerRef = useRef(0);
  const callbacksRef = useRef({ onRecorded, onError, onActivity });
  callbacksRef.current = { onRecorded, onError, onActivity };

  const releaseStream = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = 0;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const stop = useCallback(({ discard = false } = {}) => {
    discardRef.current = discard;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        releaseStream();
        setRecording(false);
      }
    }
    haptics.recordStop(module);
  }, [module, releaseStream]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    if (!voiceRecordingSupported()) {
      callbacksRef.current.onError?.(t("voiceNotes.notSupported"));
      return;
    }
    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      callbacksRef.current.onError?.(t("voiceNotes.micBlocked"));
      return;
    }

    const mimeType = pickVoiceMimeType((type) => MediaRecorder.isTypeSupported?.(type));
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
    } catch {
      recorder = new MediaRecorder(media);
    }

    chunksRef.current = [];
    discardRef.current = false;
    secondsRef.current = 0;
    streamRef.current = media;
    recorderRef.current = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunksRef.current, { type });
      const length = secondsRef.current;
      chunksRef.current = [];
      recorderRef.current = null;
      releaseStream();
      setRecording(false);
      callbacksRef.current.onActivity?.("active");

      if (discardRef.current) return;
      if (!blob.size || length < MIN_SECONDS) {
        callbacksRef.current.onError?.(t("voiceNotes.tooShort"));
        return;
      }
      try {
        const dataUrl = await readBlobAsDataUrl(blob);
        callbacksRef.current.onRecorded?.({ dataUrl, mimeType: type, seconds: length });
      } catch {
        callbacksRef.current.onError?.(t("voiceNotes.notSupported"));
      }
    });

    setSeconds(0);
    setStream(media);
    setRecording(true);
    callbacksRef.current.onActivity?.("recording");
    // A timeslice keeps data flowing so a long note is not lost if the
    // recorder is interrupted.
    recorder.start(1000);
    haptics.recordStart(module);
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) stop();
    }, 1000);
  }, [module, releaseStream, stop]);

  // Leaving the screen mid-recording throws the recording away.
  useEffect(() => () => {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  return {
    supported: voiceRecordingSupported(),
    recording,
    seconds,
    stream,
    start,
    stop: () => stop(),
    discard: () => stop({ discard: true }),
    toggle: () => (recorderRef.current ? stop() : start()),
  };
}
