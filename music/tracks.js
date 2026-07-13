/* STRATA soundtrack — Strudel patterns. v3 "descent engine" score.
   Direction: electronic, hypnotic, driving — a machine heartbeat that never
   blinks, rolling acid bass, one hypnotic arp that circles like the mandala
   gates, and the chorister's distant voice still floating above everything
   (the title-screen voice is diegetic: she is what you are diving toward).
   Synth-only (no samples), fully offline.
   v2 "distant voice" score preserved in the private dev history.
   layer: 0..8 security layer, drives intensity. */

export const tracks = {

  // ---- title: the engine idles. her voice over a slow pulse. ----
  title: () => `
setcps(0.36)
stack(
  // heartbeat kick: two beats a bar, felt not heard
  note("a1 ~ ~ ~ a1 ~ ~ ~").s("sine")
    .penv(18).pattack(0.001).pdecay(0.09)
    .decay(0.4).sustain(0).gain(0.62).shape(0.25),
  // slow hypnotic arp: the mandala turning, half-lit
  note("a2 e3 c3 a3 e3 c4 a3 e3").s("triangle")
    .attack(0.01).decay(0.32).sustain(0)
    .lpf(sine.range(500, 1500).slow(16))
    .gain("0.07 0.1 0.08 0.1")
    .delay(0.4).delaytime(0.375).delayfeedback(0.5)
    .room(0.6).roomsize(6),
  // her voice, very far away — unchanged; she is the destination
  note("<[a4@3 c5] [b4@2 a4 ~] [g4@2 e4@2] [a4@3 ~]>")
    .add(note("[0,0.05]")).s("triangle")
    .attack(2).release(2.5).sustain(0.7)
    .lpf(1400).vib(3.5).vibmod(0.08)
    .gain(0.08).room(0.97).roomsize(10).pan(0.45),
  // offbeat air-hat, barely open
  s("~ white ~ white ~ white ~ white").decay(0.03).sustain(0)
    .hpf(8000).gain(0.045),
  // sub floor breathing
  note("<a1 a1 g1 a1>").s("sine").attack(2.5).release(3).sustain(0.8)
    .gain(0.34).slow(2),
  // dark pad underneath, one chord slowly opening
  note("[a1,e2,c3]").s("sawtooth")
    .attack(3).release(4).sustain(0.7)
    .lpf(sine.range(220, 520).slow(8)).gain(0.07).slow(4),
  // air
  s("pink").attack(2).release(4).sustain(0.6).hpf(5000).gain(0.016).slow(4)
)`,

  // ---- the dive: the engine at speed. hypnotic, relentless. ----
  dive: ({ layer = 0 } = {}) => {
    const L = Math.min(layer, 8);
    return `
setcps(0.535)
stack(
  // four-on-the-floor: the descent clock
  note("a1*4").s("sine")
    .penv(26).pattack(0.001).pdecay(0.07)
    .decay(0.14).sustain(0).gain(0.9).shape(0.4),
  // rolling acid bass: offbeat 16ths, filter circling for hypnosis
  note("[~ a1]*4 [~ a1 ~ bb1] [~ a1]*4 [~ g1 ~ a1]").fast(0.5)
    .s("sawtooth").attack(0.002).decay(0.14).sustain(0.12)
    .lpf(sine.range(${300 + L * 40}, ${900 + L * 90}).slow(8))
    .shape(0.5).gain(0.5),
  // the arp: circling A-minor cells, sidechain-shaped against the kick
  note("<[a3 e4 c4 e4 a4 e4 c4 e4] [a3 e4 c4 e4 g4 e4 c4 e4]>")
    .s("square").attack(0.004).decay(0.12).sustain(0)
    .lpf(${1200 + L * 220}).gain("0.045 0.085 0.07 0.085")
    .delay(0.32).delaytime(0.1875).delayfeedback(0.4)
    .pan(sine.range(0.35, 0.65).slow(6)),
  // offbeat hats: the push
  s("[~ white]*4").decay(0.028).sustain(0)
    .hpf(7500).gain(0.13),
  // 16th shimmer on top, accented
  s("white*16").decay(0.014).sustain(0)
    .hpf(9500).gain("0.05 0.02 0.035 0.02"),
  // clap on 2 and 4, roomy
  s("~ white ~ white").decay(0.06).sustain(0)
    .hpf(1200).lpf(4500).shape(0.4).gain(0.2).room(0.3).roomsize(3),
  // dark stab every other bar: the strata answering
  note("<~ [~ ~ [a2,c3,e3] ~] ~ [~ [g2,bb2,d3] ~ ~]>").s("sawtooth")
    .attack(0.005).decay(0.22).sustain(0)
    .lpf(${700 + L * 60}).shape(0.3).gain(0.16)
    .delay(0.35).delaytime(0.375).delayfeedback(0.35),
  // her voice, far above the machine — surfacing as you go deeper
  note("<[a4@3 c5] [bb4@2 a4@2]>").add(note("[0,0.05]")).s("triangle")
    .attack(1.2).release(1.5).sustain(0.6)
    .lpf(${1000 + L * 60}).vib(4).vibmod(0.15)
    .gain(0.06).room(0.95).roomsize(8)
    .slow(4),
  // sub drone under everything
  note("a0").s("sine").attack(1.5).release(2).sustain(0.85)
    .gain(0.3).slow(4)${L >= 3 ? `,
  // L3+: second acid line answers in the gaps, one octave up
  note("[a2 ~ ~ a2] [~ bb2 ~ ~] [c3 ~ ~ g2] [~ a2 ~ ~]").fast(0.5)
    .s("sawtooth").attack(0.002).decay(0.1).sustain(0.08)
    .lpf(sine.range(600, ${1400 + L * 100}).slow(5))
    .shape(0.45).gain(0.24)` : ''}${L >= 5 ? `,
  // L5+: ghost-note percussion fills between the grid
  s("[~ ~ white ~] [~ white ~ ~] [~ ~ ~ white] [white ~ ~ ~]").fast(0.5)
    .decay(0.02).sustain(0).hpf(3200).lpf(6000).gain(0.09)` : ''}${L >= 7 ? `,
  // L7+: the silt wall hums — dark detuned swell under the floor
  note("[a1,bb1]").s("sawtooth")
    .attack(1.4).release(2).sustain(0.7)
    .lpf(360).gain(0.12).slow(2)` : ''}
)`;
  },

  // ---- TRACED: the countersong. same engine, teeth out. ----
  traced: ({ layer = 0 } = {}) => {
    const L = Math.min(layer, 8);
    return `
setcps(0.575)
stack(
  // kick harder, driving through
  note("a1*4").s("sine")
    .penv(26).pattack(0.001).pdecay(0.08)
    .decay(0.15).sustain(0).gain(0.95).shape(0.5),
  // acid bass snaps to the tritone: the hunt theme
  note("[~ a1]*4 [~ bb1 ~ eb2] [~ a1]*4 [~ eb2 ~ bb1]").fast(0.5)
    .s("sawtooth").attack(0.002).decay(0.13).sustain(0.14)
    .lpf(sine.range(${420 + L * 40}, ${1200 + L * 90}).slow(4))
    .shape(0.55).gain(0.52),
  // the arp keeps circling but the cell darkens
  note("[a3 eb4 c4 eb4 a4 eb4 c4 eb4]")
    .s("square").attack(0.004).decay(0.11).sustain(0)
    .lpf(${1500 + L * 200}).gain("0.05 0.095 0.08 0.095")
    .delay(0.3).delaytime(0.1875).delayfeedback(0.42)
    .pan(sine.range(0.3, 0.7).slow(3)),
  // hats flat out
  s("[~ white]*4").decay(0.026).sustain(0).hpf(7500).gain(0.15),
  s("white*16").decay(0.013).sustain(0)
    .hpf(9500).gain("0.06 0.025 0.04 0.025"),
  // clap doubles: 2, 4 and the and-of-4
  s("~ white ~ [white white]").decay(0.055).sustain(0)
    .hpf(1200).lpf(4800).shape(0.45).gain(0.22).room(0.3).roomsize(3),
  // tritone alarm stab whipping across the field
  note("[a5@2 eb5]*2").s("square")
    .decay(0.06).sustain(0).gain(0.13)
    .delay(0.3).delaytime(0.25).delayfeedback(0.3)
    .pan(sine.fast(4)),
  // her wail pushes through the countersong
  note("<[a4@3 c5] [bb4@2 a4@2]>").add(note("[0,0.05]")).s("triangle")
    .attack(1).release(1.5).sustain(0.6)
    .lpf(${1100 + L * 60}).vib(4.5).vibmod(0.2)
    .gain(0.08).room(0.95).roomsize(8)
    .slow(4),
  // riser noise: the net closing
  s("white").attack(2).release(0.3).sustain(0.4)
    .hpf(sine.range(1500, 6000).slow(4)).gain(0.05).slow(2),
  // sub + dark swell
  note("a0").s("sine").attack(1).release(2).sustain(0.85).gain(0.32).slow(4),
  note("[a1,eb2]").s("sawtooth")
    .attack(1).release(2).sustain(0.7)
    .lpf(420).gain(0.11).slow(2)
)`;
  },

  // ---- free look: the engine idles in the fog. hypnosis, no clock. ----
  freelook: () => `
setcps(0.42)
stack(
  // the arp slowed to a mobile, hanging in space
  note("a2 e3 c3 a3 [e3 c4] a3 e3 c3").s("triangle")
    .attack(0.02).decay(0.5).sustain(0)
    .lpf(sine.range(450, 1300).slow(12))
    .gain(0.11)
    .delay(0.5).delaytime(0.375).delayfeedback(0.55)
    .room(0.8).roomsize(8)
    .pan(sine.range(0.3, 0.7).slow(9)),
  // soft pulse: the dive waiting for you
  note("a1 ~ ~ ~ ~ ~ a1 ~").s("sine")
    .penv(12).pattack(0.001).pdecay(0.08)
    .decay(0.3).sustain(0).gain(0.4),
  // offbeat hat, mostly air
  s("~ white ~ ~ ~ white ~ ~").decay(0.03).sustain(0)
    .hpf(9000).gain(0.04),
  // pad: one minor chord breathing
  note("<[a1,e2,c3] [g1,d2,bb2]>").s("sawtooth")
    .attack(3.5).release(4).sustain(0.7)
    .lpf(sine.range(240, 560).slow(10)).gain(0.085).slow(4),
  // her voice drifts over the frozen dive
  note("<~ [~ e4 g4 ~] ~ [c5 b4 ~ g4] ~ ~ [a4 ~ e4 c4] ~>").s("triangle")
    .vib(4).vibmod(0.15)
    .attack(0.4).release(1.5).sustain(0.5)
    .lpf(1300).gain(0.09)
    .room(0.9).roomsize(8)
    .delay(0.35).delaytime(0.375).delayfeedback(0.4),
  // sub floor
  note("a1").s("sine").attack(3).release(4).sustain(0.8).gain(0.3).slow(4)
)`,

  // ---- signal lost: the engine powers down. only she remains. ----
  gameover: () => `
setcps(0.22)
stack(
  // the arp decays, filter closing like eyes
  note("a3 e3 c3 a2 e2 c2 a1 ~").s("triangle")
    .attack(0.01).decay(0.5).sustain(0)
    .lpf(saw.range(2200, 220)).gain(0.2)
    .delay(0.4).delaytime(0.5).delayfeedback(0.4)
    .room(0.8).roomsize(8).slow(2),
  // kick slowing to a stop
  note("a1 ~ ~ a1 ~ ~ a1 ~").s("sine")
    .penv(16).pattack(0.001).pdecay(0.09)
    .decay(0.3).sustain(0).gain("0.55 0.4 0.28").shape(0.2).slow(2),
  // her voice, unbothered, still there
  note("~ ~ [e4 ~ c4 b3] [a3@3 ~]").s("triangle")
    .vib(5).vibmod(0.3)
    .attack(0.4).decay(0.6).sustain(0.4).release(2)
    .lpf(1500).gain(0.12)
    .room(0.95).roomsize(9)
    .delay(0.4).delaytime(0.6).delayfeedback(0.45).slow(2),
  // sub gives out
  note("a1 ~ ~ ~ f1 ~ ~ ~").s("sine")
    .attack(0.02).decay(1).sustain(0.05)
    .shape(0.15).gain(0.45).slow(2),
  // static settling
  s("pink").attack(0.5).release(6).sustain(0.5)
    .lpf(saw.range(1600, 200).slow(4)).gain(0.05).slow(4)
)`,
};
