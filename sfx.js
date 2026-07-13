/* Shared synth audio engine: used by the game (game.js) and the
   SFX soundboard (soundboard.html) so both always play identical code. */

export const AU = { ctx: null };

let fxMuted = () => false;
export function setFxMuted(fn) { fxMuted = fn; }

export function audioInit() {
  if (AU.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  AU.ctx = ctx;
  AU.master = ctx.createGain(); AU.master.gain.value = 0.45;
  const comp = ctx.createDynamicsCompressor();
  AU.master.connect(comp); comp.connect(ctx.destination);
  // ambient bus: continuous drones (engine hum + trace dissonance) get their
  // own volume setting, independent of the one-shot game SFX on AU.master
  AU.ambient = ctx.createGain(); AU.ambient.gain.value = 0.45;
  AU.ambient.connect(comp);

  // engine hum: two detuned saws through a lowpass
  AU.humFilter = ctx.createBiquadFilter();
  AU.humFilter.type = 'lowpass'; AU.humFilter.frequency.value = 260;
  AU.humGain = ctx.createGain(); AU.humGain.gain.value = 0.0;
  AU.humFilter.connect(AU.humGain); AU.humGain.connect(AU.ambient);
  AU.hum = [55, 55.8].map(f => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(AU.humFilter); o.start();
    return o;
  });
  // trace dissonance layer — binaural pair: one sine per ear, the L/R
  // frequency difference is heard as a beat that speeds up with the trace
  // meter (needs headphones; on speakers it degrades to a slow shimmer)
  AU.traceGain = ctx.createGain(); AU.traceGain.gain.value = 0;
  AU.traceGain.connect(AU.ambient);
  AU.traceOscs = [-1, 1].map(side => {
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 233;
    const p = ctx.createStereoPanner(); p.pan.value = side;
    o.connect(p); p.connect(AU.traceGain); o.start();
    return o;
  });

  // minigun rip: continuous layers pumped by every chainTick round —
  // under sustained fire (~45 rps) they saturate into one tearing roar,
  // and die ~80ms after the last round
  const gl = ctx.sampleRate * 1.5;
  const gbuf = ctx.createBuffer(1, gl, ctx.sampleRate);
  const gd = gbuf.getChannelData(0);
  for (let i = 0; i < gl; i++) gd[i] = Math.random() * 2 - 1;
  AU.gunNoise = ctx.createBufferSource();
  AU.gunNoise.buffer = gbuf; AU.gunNoise.loop = true;
  AU.gunBody = ctx.createBiquadFilter();
  AU.gunBody.type = 'bandpass'; AU.gunBody.frequency.value = 1050; AU.gunBody.Q.value = 0.7;
  AU.gunAir = ctx.createBiquadFilter();
  AU.gunAir.type = 'highpass'; AU.gunAir.frequency.value = 3200;
  AU.gunBodyGain = ctx.createGain(); AU.gunBodyGain.gain.value = 0;
  AU.gunAirGain = ctx.createGain(); AU.gunAirGain.gain.value = 0;
  AU.gunNoise.connect(AU.gunBody); AU.gunBody.connect(AU.gunBodyGain); AU.gunBodyGain.connect(AU.master);
  AU.gunNoise.connect(AU.gunAir); AU.gunAir.connect(AU.gunAirGain); AU.gunAirGain.connect(AU.master);
  AU.gunNoise.start();
  AU.gunSawGain = ctx.createGain(); AU.gunSawGain.gain.value = 0;
  const sawLP = ctx.createBiquadFilter();
  sawLP.type = 'lowpass'; sawLP.frequency.value = 620;
  sawLP.connect(AU.gunSawGain); AU.gunSawGain.connect(AU.master);
  AU.gunSaws = [88, 91.5].map(f => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(sawLP); o.start();
    return o;
  });
}

export function tone(freq, dur = 0.08, type = 'sine', vol = 0.2, slide = 0) {
  if (!AU.ctx || fxMuted()) return;
  const t = AU.ctx.currentTime;
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AU.master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function noiseBurst(dur = 0.25, vol = 0.3, low = false) {
  if (!AU.ctx || fxMuted()) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = vol;
  if (low) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    src.connect(f); f.connect(g);
  } else src.connect(g);
  g.connect(AU.master); src.start(t);
}

export function whoosh(dur = 0.25, vol = 0.12, f0 = 400, f1 = 2200, peak = 0.7) {
  if (!AU.ctx || fxMuted()) return;
  const ctx = AU.ctx, t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.3;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * peak);  // peak early = recede, late = approach
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(AU.master);
  src.start(t);
}

export const sfx = {
  ring:   () => tone(1400, 0.03, 'sine', 0.05),
  fire:   () => {
    noiseBurst(0.03, 0.22);                   // muzzle crack (bright, instant)
    noiseBurst(0.18, 0.2, true);              // low report tail
    tone(320, 0.11, 'sawtooth', 0.12, -230);  // bark, 320 -> 90Hz
    tone(170, 0.22, 'sine', 0.3, -125);       // boom, 170 -> 45Hz
  },
  kodamaFire: () => {
    noiseBurst(0.03, 0.07, true);
    tone(980, 0.06, 'square', 0.06, -420);
  },
  kill:   () => { tone(660, 0.06, 'square', 0.15); setTimeout(() => tone(990, 0.08, 'square', 0.15), 55); },
  chainTick: () => {
    if (!AU.ctx || fxMuted()) return;
    const t = AU.ctx.currentTime;
    const pump = (p, v) => {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, 0.008);         // near-instant attack
      p.setTargetAtTime(0, t + 0.028, 0.05);  // dies fast once rounds stop
    };
    pump(AU.gunBodyGain.gain, 0.13);  // mid rip — the tearing core
    pump(AU.gunAirGain.gain, 0.05);   // high sizzle — air being cut
    pump(AU.gunSawGain.gain, 0.11);   // low snarl — physical roar
    tone(560 + Math.random() * 90, 0.018, 'square', 0.045, -260); // per-round tick
  },
  tachDown: () => tone(430, 0.3, 'triangle', 0.16, -280),
  enemyFire: () => {
    // crack: the round snaps past you first
    noiseBurst(0.02, 0.16);
    tone(1900 + Math.random() * 400, 0.025, 'square', 0.05, -1100);
    // whoosh: its wake tearing away behind it (falling sweep, fast fade)
    setTimeout(() => whoosh(0.2, 0.11, 2200, 480 + Math.random() * 120, 0.22), 40);
    // boom: the muzzle report from THEIR gun arrives last
    setTimeout(() => {
      noiseBurst(0.2, 0.14, true);
      tone(120, 0.22, 'sine', 0.16, -75);  // muffled, 120 -> 45Hz
    }, 280 + Math.random() * 80);
  },
  evaded: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.18), i * 70)),
  uiTick: () => tone(880, 0.035, 'square', 0.08),
  hitSpark: () => {
    if (!AU.ctx || fxMuted()) return;
    const r = Math.random();
    if (r < 0.18) {
      // ricochet: glances off, peeow zing + wake whizzing away
      noiseBurst(0.015, 0.08);
      tone(2200 + Math.random() * 600, 0.26, 'sine', 0.05, -1700);
      whoosh(0.22, 0.06, 1800 + Math.random() * 400, 420, 0.2);
      return;
    }
    noiseBurst(0.02, 0.1);  // impact click
    if (r < 0.46) {
      // thin plate: bright ping, round punches straight through
      tone(2600 + Math.random() * 700, 0.05, 'square', 0.05, -1400);
      tone(4100 + Math.random() * 800, 0.03, 'sine', 0.04, -900);
    } else if (r < 0.78) {
      // mid plate: metallic clank, inharmonic pair
      tone(1150 + Math.random() * 250, 0.06, 'square', 0.06, -500);
      tone(1580 + Math.random() * 300, 0.045, 'triangle', 0.05, -700);
    } else {
      // heavy plate: dull clunk, barely rings
      noiseBurst(0.05, 0.12, true);
      tone(320 + Math.random() * 90, 0.07, 'square', 0.07, -180);
    }
  },
  breach: () => [523, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.18), i * 55)),
  hot:    () => [523, 784, 1047, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.2), i * 50)),
  graze:  () => tone(1760, 0.05, 'sine', 0.1),
  hit:    () => { noiseBurst(0.3, 0.4); tone(90, 0.35, 'sawtooth', 0.3, -40); },
  save:   () => { tone(392, 0.1, 'triangle', 0.2); setTimeout(() => tone(523, 0.12, 'triangle', 0.2), 80); },
  alarm:  () => { tone(660, 0.12, 'square', 0.14); setTimeout(() => tone(466, 0.12, 'square', 0.14), 140); },
  layer:  () => { tone(262, 0.16, 'triangle', 0.2); setTimeout(() => tone(392, 0.2, 'triangle', 0.2), 120); },
  dead:   () => { tone(440, 0.9, 'sawtooth', 0.3, -400); noiseBurst(0.8, 0.35, true); },
  respawn:() => [784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.09, 'triangle', 0.15), i * 70)),
  pickup: () => [659, 880, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.09, 'triangle', 0.2), i * 45)),
  btToggle: on => on
    ? tone(320, 0.5, 'sine', 0.25, -220)
    : tone(140, 0.3, 'sine', 0.2, 180),
  breakerSmash: () => { noiseBurst(0.35, 0.45, true); tone(70, 0.4, 'sawtooth', 0.35, -30); },
};
