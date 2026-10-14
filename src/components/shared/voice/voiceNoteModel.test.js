import assert from "node:assert/strict";
import test from "node:test";

import { formatVoiceTime, pickVoiceMimeType, voiceSourceType, voiceWaveform } from "./voiceNoteModel.js";

test("recording prefers MP4/AAC, then WebM, and lets the browser choose otherwise", () => {
  assert.equal(pickVoiceMimeType((type) => type.startsWith("audio/mp4")), "audio/mp4;codecs=mp4a.40.2");
  assert.equal(pickVoiceMimeType((type) => type === "audio/webm;codecs=opus"), "audio/webm;codecs=opus");
  assert.equal(pickVoiceMimeType(() => false), "");
  assert.equal(pickVoiceMimeType(undefined), "");
  assert.equal(pickVoiceMimeType(() => { throw new Error("nope"); }), "");
});

test("voice times read like a phone's", () => {
  assert.equal(formatVoiceTime(7.4), "0:07");
  assert.equal(formatVoiceTime(65), "1:05");
  assert.equal(formatVoiceTime(Infinity), "0:00");
  assert.equal(formatVoiceTime(NaN), "0:00");
});

test("a note always draws the same waveform", () => {
  const bars = voiceWaveform("note-1", 24);
  assert.equal(bars.length, 24);
  assert.deepEqual(voiceWaveform("note-1", 24), bars);
  assert.notDeepEqual(voiceWaveform("note-2", 24), bars);
  assert.ok(bars.every((height) => height >= 0.25 && height <= 1));
});

test("the source type comes from a data URL or the file extension", () => {
  assert.equal(voiceSourceType("data:audio/webm;codecs=opus;base64,AAAA"), "audio/webm");
  assert.equal(voiceSourceType("data:audio/mp4,AAAA"), "audio/mp4");
  assert.equal(voiceSourceType("https://x.supabase.co/storage/v1/object/sign/a/b/audio-1.webm?token=t"), "audio/webm");
  assert.equal(voiceSourceType("https://x/y/z.m4a"), "audio/mp4");
  assert.equal(voiceSourceType("https://x/y/z"), "");
});
