let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ??= new AudioCtor();
  return audioContext;
}

function envelopeGain(context: AudioContext, peak = 0.18, duration = 0.12) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, context.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  gain.connect(context.destination);
  return gain;
}

export function playSaleSound(enabled: boolean, kind: "normal" | "beer" = "normal") {
  if (!enabled) return;
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    void context.resume();
  }

  if (kind === "beer") {
    const pop = context.createOscillator();
    pop.type = "triangle";
    pop.frequency.setValueAtTime(140, context.currentTime);
    pop.frequency.exponentialRampToValueAtTime(420, context.currentTime + 0.025);
    pop.connect(envelopeGain(context, 0.26, 0.16));
    pop.start();
    pop.stop(context.currentTime + 0.17);

    const bufferSize = Math.floor(context.sampleRate * 0.18);
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1600;
    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(envelopeGain(context, 0.09, 0.2));
    noise.start(context.currentTime + 0.035);
    noise.stop(context.currentTime + 0.23);
    return;
  }

  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(660, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.08);
  oscillator.connect(envelopeGain(context, 0.14, 0.13));
  oscillator.start();
  oscillator.stop(context.currentTime + 0.14);
}
