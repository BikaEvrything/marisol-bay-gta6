// All sound, generated in the browser with the Web Audio API: no audio files. A tiny synthesiser
// builds every effect out of oscillators and filtered noise, so the whole soundscape is original
// and local. The context is created lazily on the first user gesture (browsers block autoplay),
// and everything no-ops quietly when audio is unavailable or muted.

let context = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let sirenGain = null;
let sirenTimer = 0;
let sirenHigh = false;
let muted = false;

function ensure() {
  if (context || typeof window === 'undefined') return context;
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  master = context.createGain();
  master.gain.value = 0.5;
  master.connect(context.destination);

  // The engine: a saw through a low-pass, pitched by speed, silent until a car is driven.
  engineOsc = context.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 60;
  engineFilter = context.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 400;
  engineGain = context.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  engineOsc.start();

  // The siren: a triangle that flips between two tones while the police are after you.
  sirenGain = context.createGain();
  sirenGain.gain.value = 0;
  sirenGain.connect(master);
  return context;
}

/** Called on the first key press or click of a session. */
export function unlockAudio() {
  const ctx = ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() {
  return muted;
}

/** One enveloped tone: the workhorse of every one-shot sound. */
function tone(type, freq, toFreq, time, gainValue, when) {
  if (!context) return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + (when ?? 0);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (toFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), start + time);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + time);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + time + 0.05);
}

/** A short burst of filtered noise: impacts, splashes, the shove. */
function noise(time, freq, gainValue, type) {
  if (!context) return;
  const length = Math.floor(context.sampleRate * time);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = type ?? 'lowpass';
  filter.frequency.value = freq;
  const gain = context.createGain();
  gain.gain.value = gainValue;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
}

export const SFX = {
  ui() {
    tone('square', 660, 660, 0.07, 0.12);
  },
  cash() {
    tone('sine', 880, 880, 0.09, 0.16);
    tone('sine', 1320, 1320, 0.12, 0.14, 0.07);
  },
  pickup() {
    tone('sine', 590, 890, 0.14, 0.15);
  },
  missionStart() {
    tone('sine', 523, 523, 0.12, 0.14);
    tone('sine', 659, 659, 0.12, 0.14, 0.1);
    tone('sine', 784, 784, 0.18, 0.14, 0.2);
  },
  missionDone() {
    tone('sine', 659, 659, 0.12, 0.15);
    tone('sine', 784, 784, 0.12, 0.15, 0.1);
    tone('sine', 988, 988, 0.12, 0.15, 0.2);
    tone('sine', 1319, 1319, 0.24, 0.15, 0.3);
  },
  fail() {
    tone('sawtooth', 300, 140, 0.5, 0.14);
  },
  shove() {
    noise(0.12, 900, 0.25);
    tone('square', 180, 90, 0.1, 0.1);
  },
  crash() {
    noise(0.22, 500, 0.3);
  },
  splash() {
    noise(0.4, 1400, 0.2, 'bandpass');
  },
  horn() {
    tone('square', 392, 392, 0.28, 0.16);
    tone('square', 494, 494, 0.28, 0.1);
  },
  busted() {
    tone('sawtooth', 220, 110, 0.7, 0.16);
    tone('sawtooth', 165, 82, 0.7, 0.14, 0.35);
  },
  wanted() {
    tone('square', 740, 500, 0.2, 0.13);
  },
};

/**
 * Per-frame audio state from the world: the engine pitch follows the driven car's speed, the
 * siren runs while any police car is chasing. `dt` advances the siren's two-tone flip.
 */
export function stepAudio(world, dt) {
  if (!context) return;
  const driving = world.player.inVehicle;
  if (engineGain) {
    const target = driving ? 0.07 + Math.min(0.06, Math.abs(world.player.vehicle.speed) / 5000) : 0;
    engineGain.gain.value += (target - engineGain.gain.value) * Math.min(1, dt * 8);
    const speed = driving ? Math.abs(world.player.vehicle.speed) : 0;
    engineOsc.frequency.value = 55 + speed * 0.45;
    engineFilter.frequency.value = 300 + speed * 1.6;
  }
  const chased = world.police.some((c) => c.active && c.chasing);
  if (sirenGain) {
    const target = chased && world.wanted > 0 ? 0.06 : 0;
    sirenGain.gain.value += (target - sirenGain.gain.value) * Math.min(1, dt * 4);
    if (chased && world.wanted > 0) {
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        tone('triangle', sirenHigh ? 960 : 660, sirenHigh ? 960 : 660, 0.4, 0.1);
      }
    }
  }
}
