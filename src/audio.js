// Everything audible is synthesised — gugak met with electronics. One-shot effects plus a
// step sequencer that follows the current night watch and speeds up during sinmyeong (fever).
import { ZONES } from './config.js';

// A 12-step cycle in 12/8, after the janggu's gutgeori and jajinmori patterns:
// KUNG is the low left-hand drum, DEOK the right-hand stick.
const STEPS = 12;
const KUNG = [0, 3, 6, 9];
const DEOK = [2, 4, 8, 10, 11];
// Gyemyeonjo-like pentatonic: root, minor third, fourth, fifth, minor seventh, octave.
const SCALE = [1, 1.2, 1.3333, 1.5, 1.8, 2];
const MELODY = [0, 2, 3, 2, 4, 3, 2, 0, 3, 4, 5, 3];
const LOOKAHEAD = 0.12;

export function createAudio(settings) {
  let ac = null, sfxBus = null, musicBus = null;
  let on = { sfx: settings.sfx, music: settings.music };
  let music = { playing: false, zone: 0, fever: false };
  let nextNote = 0, stepIdx = 0, bar = 0;

  function init() {
    if (ac) { if (ac.state !== 'running') ac.resume(); return; }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    try {
      ac = new Ctor();
      sfxBus = ac.createGain();
      musicBus = ac.createGain();
      sfxBus.connect(ac.destination);
      musicBus.connect(ac.destination);
      applyGains();
    } catch (err) {
      ac = null; // no audio device: the game stays fully playable, just silent
    }
  }

  function applyGains() {
    if (!ac) return;
    sfxBus.gain.value = on.sfx ? 0.5 : 0;
    musicBus.gain.value = on.music ? 0.32 : 0;
  }

  function voice(bus, freq, { dur = 0.1, type = 'square', vol = 0.15, slide = 0, at = 0, cutoff = 0 }) {
    const t = Math.max(at, ac.currentTime);
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      osc.connect(filter); filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function burst(bus, { dur = 0.4, vol = 0.3, at = 0, type = 'lowpass', freq = 900 }) {
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, n, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), gain = ac.createGain(), filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    src.buffer = buffer;
    gain.gain.value = vol;
    src.connect(filter); filter.connect(gain); gain.connect(bus);
    src.start(Math.max(at, ac.currentTime));
  }

  const tone = (freq, dur, type, vol, slide = 0, delay = 0) => {
    if (ac && on.sfx) voice(sfxBus, freq, { dur, type, vol, slide, at: ac.currentTime + delay });
  };
  const noise = (dur, vol) => { if (ac && on.sfx) burst(sfxBus, { dur, vol }); };
  const chord = (root, ratio, n, dur, type, vol, gap) => {
    for (let i = 0; i < n; i++) tone(root * Math.pow(ratio, i), dur, type, vol, 0, i * gap);
  };

  const sfx = {
    flap: () => tone(520, 0.07, 'triangle', 0.12, 240),
    pass: () => tone(660, 0.09, 'square', 0.07),
    phase: () => tone(880, 0.12, 'sawtooth', 0.07, 500),
    perfect(combo) {
      const base = 523 * Math.pow(1.06, Math.min(combo, 14));
      tone(base, 0.14, 'triangle', 0.12);
      tone(base * 1.25, 0.14, 'triangle', 0.1, 0, 0.05);
      tone(base * 1.5, 0.2, 'triangle', 0.1, 0, 0.1);
    },
    orb: () => tone(1180, 0.06, 'sine', 0.1, 400),
    power: () => chord(440, 1.26, 4, 0.12, 'square', 0.08, 0.06),
    dash() { tone(180, 0.35, 'sawtooth', 0.14, 900); noise(0.25, 0.12); },
    shield() { tone(300, 0.25, 'triangle', 0.2, -200); noise(0.2, 0.2); },
    die() { tone(220, 0.6, 'sawtooth', 0.18, -180); noise(0.6, 0.35); },
    zone: () => chord(330, 1.5, 3, 0.3, 'triangle', 0.1, 0.1),
    // kkwaenggwari: the small gong that drives a pungmul band into a frenzy
    fever() {
      for (let i = 0; i < 6; i++) { tone(2350, 0.07, 'square', 0.07, 0, i * 0.07); tone(3140, 0.05, 'square', 0.04, 0, i * 0.07); }
    },
    // jing: the large gong that announces the boss
    gong() { tone(98, 1.6, 'sine', 0.3, -8); tone(196.5, 1.2, 'triangle', 0.12); tone(293, 0.9, 'sine', 0.06); },
    roar() { tone(90, 0.7, 'sawtooth', 0.2, -40); noise(0.5, 0.25); },
    bossHit() { tone(160, 0.25, 'square', 0.18, 500); noise(0.2, 0.25); },
    ascend: () => chord(294, 1.2247, 7, 0.3, 'triangle', 0.11, 0.07),
    gift: () => chord(587, 1.3333, 3, 0.14, 'triangle', 0.09, 0.06),
    bump() { tone(200, 0.12, 'triangle', 0.14, -80); },
    kill() { tone(140, 0.2, 'square', 0.16, 600); noise(0.18, 0.22); },
    revive: () => chord(262, 1.335, 4, 0.22, 'triangle', 0.12, 0.08),
    ui: () => tone(740, 0.05, 'square', 0.06),
    reward: () => chord(660, 1.26, 3, 0.14, 'triangle', 0.1, 0.07),
  };

  function scheduleStep(i, at) {
    const root = ZONES[music.zone].root;
    const hot = music.fever;
    if (KUNG.includes(i)) voice(musicBus, i === 0 ? 118 : 104, { dur: 0.2, type: 'sine', vol: i === 0 ? 0.55 : 0.4, slide: -60, at });
    if (DEOK.includes(i) || i === 0) burst(musicBus, { dur: 0.045, vol: i === 0 ? 0.16 : 0.1, at, type: 'highpass', freq: 2600 });
    // a bowed drone under everything, like an ajaeng
    if (i === 0 || i === 6) voice(musicBus, root / 2, { dur: 0.55, type: 'sawtooth', vol: 0.2, at, cutoff: 380 });
    // plucked melody, like a gayageum, with a little vibrato bend (nonghyeon) on some notes
    if (hot || i % 2 === 0) {
      const freq = root * 2 * SCALE[MELODY[(i + bar * 5) % MELODY.length]] * (hot ? 2 : 1);
      voice(musicBus, freq, { dur: 0.24, type: 'triangle', vol: 0.11, at, slide: i % 4 === 2 ? freq * 0.06 : 0 });
    }
    if (hot) burst(musicBus, { dur: 0.03, vol: 0.12, at, type: 'highpass', freq: 5200 });
  }

  /** Call once per frame; schedules any sequencer steps falling inside the lookahead window. */
  function tick() {
    if (!ac || !on.music || !music.playing) return;
    const stepLen = 60 / (96 + music.zone * 5 + (music.fever ? 16 : 0)) / 3;
    if (nextNote < ac.currentTime) nextNote = ac.currentTime + 0.03;
    while (nextNote < ac.currentTime + LOOKAHEAD) {
      scheduleStep(stepIdx, nextNote);
      nextNote += stepLen;
      stepIdx = (stepIdx + 1) % STEPS;
      if (stepIdx === 0) bar++;
    }
  }

  return {
    init,
    tick,
    sfx,
    setMusic(patch) { music = { ...music, ...patch }; },
    setEnabled(patch) { on = { ...on, ...patch }; applyGains(); },
  };
}
