// Records the microphone and returns a 16 kHz mono WAV file.
// WAV is a format that Google's AI accepts, and it needs no extra programs.

export function voiceSupported() {
  return !!(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export function mixToMono(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

export function downsample(samples, fromRate, toRate) {
  if (fromRate <= toRate) return samples;
  const ratio = fromRate / toRate;
  const newLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function blobToWav(blob) {
  const data = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(data);
  } finally {
    if (ctx.close) ctx.close();
  }
  return encodeWav(downsample(mixToMono(decoded), decoded.sampleRate, 16000), 16000);
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250);
  const startedAt = Date.now();

  function release() {
    stream.getTracks().forEach((t) => t.stop());
  }

  return {
    seconds() {
      return (Date.now() - startedAt) / 1000;
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release();
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
            resolve(await blobToWav(blob));
          } catch (e) {
            reject(e);
          }
        };
        if (recorder.state !== "inactive") recorder.stop();
        else recorder.onstop();
      });
    },
    cancel() {
      try {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
      } catch (e) {
        // nothing to do
      }
      release();
    },
  };
}
