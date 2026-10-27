// Makes a recorded voice louder and more even: the microphone goes through a
// compressor (soft and loud words end up closer) and a gain stage before it
// is recorded. Anything the device can't do falls back to the plain mic.
const VOICE_GAIN = 2.2;

export const VOICE_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

// Returns { stream, close }: record `stream`; call close() when done (it does
// not stop the microphone's own tracks).
export async function boostVoiceStream(micStream) {
  const plain = { stream: micStream, close: () => {} };
  const Context = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!Context || !micStream) return plain;

  let context;
  try {
    context = new Context();
    if (typeof context.createMediaStreamDestination !== "function") throw new Error("no stream destination");
    if (context.state === "suspended") await context.resume().catch(() => {});

    const source = context.createMediaStreamSource(micStream);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -28;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    const gain = context.createGain();
    gain.gain.value = VOICE_GAIN;
    const destination = context.createMediaStreamDestination();
    source.connect(compressor).connect(gain).connect(destination);

    if (!destination.stream.getAudioTracks().length) throw new Error("no boosted track");
    return {
      stream: destination.stream,
      close: () => {
        destination.stream.getTracks().forEach((track) => track.stop());
        context.close().catch(() => {});
      },
    };
  } catch {
    context?.close?.().catch?.(() => {});
    return plain;
  }
}
