import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { AU, audioInit, tone, noiseBurst, sfx, setFxMuted } from './sfx.js';
import { ICE_NAME, ICE_LINES, HARMONY_APPROACH, MERGE_LINES, CHATTER_ADDITIONS } from './dialogue.js';

/* ============================================================
   STRATA — strata-dive arcade
   Skydive through layered defense strata with two KODAMA
   escorts. Mouse steers, click fires. Engraved-wireframe visuals.
   ============================================================ */

// ---------------- constants ----------------
const TUNNEL_R   = 6.0;    // barrier disc radius
const INTRO_LEN  = 4.4;    // materialize + camera orbit before the dive (from title)
const INTRO_REDIVE = 1.2;  // compressed intro for re-dives: death costs seconds, not ceremony
const PLAY_R     = 4.6;    // player steering radius
const SPAWN_Z    = -430;   // where things are born
const KILL_Z     = 16;     // where things die behind camera
const RING_GAP   = 14;
const RING_COUNT = 34;
const LAYER_LEN  = 500;    // metres per security layer

const COL = {
  ink:   0xe8f1ff,
  dim:   0x39465c,
  red:   0xff3040,
  amber: 0xffb020,
  blue:  0x4db8ff,
  bg:    0x05060a,
};

const LAYER_NAMES = [
  ['SURFACE STRATUM',        '表層防壁'],
  ['PERIMETER ICE',          '外周氷壁'],
  ['TRAFFIC CONTROL GRID',   '交通管制網'],
  ['MEMORY VAULT',           '外部記憶庫'],
  ['VESSEL FOUNDRY',        '器ノ鋳造所'],
  ['WARDEN ARRAY',          '守衛機関列'],
  ['SILT WALL APPROACH',    '黒泥接近'],
  ['CHOIR LINE',            '聖歌回線'],
  ['CHORISTER\'S SEAT',      '聖歌手ノ座'],
];

const CHATTER = {
  start:  ['コダマ、行きまーす！', 'Escort formation locked!', 'ダイブ開始！'],
  breach: ['ナイス突破！', 'すごーい！', 'Barrier down!', 'その調子！'],
  hot:    ['ホットゲート確認！トレース低下！', 'Risky! I like it!'],
  kill:   ['敵性ICE、撃破！', 'Got one!', 'ロックオン、命中！'],
  save:   ['僕が受けるよ！', 'Taking the hit — go!', '装甲ハ伊達ジャナイ！'],
  down:   ['ごめん…離脱する…', 'Unit offline… rejoining soon…'],
  back:   ['復帰！お待たせ！', 'Back in formation!'],
  traced: ['逆探知されてる！気をつけて！', 'Countersong inbound!!'],
  vent:   ['トレース値、低下！', 'Trace vented!'],
  feral:  ['狂った木霊！？僕たちを狙ってる！', 'Feral KODAMA — it wants US!'],
  shell:  ['空の器…気味悪いよ…', 'Empty vessels ahead. Careful.'],
  keeper: ['敵の守衛機関！大型だ！', 'GRAVEKEEPER — big one!'],
  chor:   ['これは…上位存在…！', 'Something vast is waiting below…'],
};
Object.assign(CHATTER, CHATTER_ADDITIONS);

// ---------------- renderer / scene ----------------
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// phones cap lower: the attract sim + bloom at dpr 3 melts mobile GPUs
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);
scene.fog = new THREE.Fog(COL.bg, 70, 400);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 700);
camera.position.set(0, 0, 9);

// HDR bloom pipeline
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// soft radial glow sprite for every particle system (kills the square-pixel look)
const glowTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();

// ---------------- materials (shared) ----------------
const M = {
  ink:      new THREE.LineBasicMaterial({ color: COL.ink,   transparent: true, opacity: 0.9 }),
  dim:      new THREE.LineBasicMaterial({ color: COL.dim,   transparent: true, opacity: 0.7 }),
  red:      new THREE.LineBasicMaterial({ color: COL.red,   transparent: true, opacity: 0.95 }),
  amber:    new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.95 }),
  blue:     new THREE.LineBasicMaterial({ color: COL.blue,  transparent: true, opacity: 0.95 }),
  // disc fill a step darker than raw ink: the pale segments were washing out
  // the obsidian palette whenever a gate filled the frame
  fillInk:  new THREE.MeshBasicMaterial({ color: 0xaab6c8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  fillRed:  new THREE.MeshBasicMaterial({ color: COL.red,   transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  redSolid: new THREE.MeshBasicMaterial({ color: COL.red }),
  amberSolid: new THREE.MeshBasicMaterial({ color: COL.amber }),
  blueSolid:  new THREE.MeshBasicMaterial({ color: COL.blue }),
};
// HDR-boost the solid cores so bloom picks them out of the linework
M.redSolid.color.multiplyScalar(2.4);
M.amberSolid.color.multiplyScalar(2.4);
M.blueSolid.color.multiplyScalar(2.2);

// ---------------- UI refs ----------------
const $ = id => document.getElementById(id);
const ui = {
  score: $('score'), mult: $('mult'), depth: $('depth'), layerName: $('layerName'),
  integ: $('integ'), tachUI: $('tachUI'), energy: $('energy'),
  traceFill: $('traceFill'), tracePct: $('tracePct'),
  announce: $('announce'), feed: $('feed'), chatter: $('chatter'), ice: $('ice'),
  title: $('title'), over: $('over'), overStats: $('overStats'),
  best: $('best'), flash: $('flash'),
  pause: $('pause'), scores: $('scores'), scoresOver: $('scoresOver'),
  btFill: $('btFill'), breakers: $('breakers'),
};

// ---------------- scoreboard ----------------
function loadScores() {
  try { return JSON.parse(localStorage.getItem('ab_scores') || '[]'); }
  catch { return []; }
}
function saveScore(s, d, l) {
  const arr = loadScores();
  const entry = { s, d, l, ts: Date.now() };
  arr.push(entry);
  arr.sort((a, b) => b.s - a.s);
  const top = arr.slice(0, 10);
  localStorage.setItem('ab_scores', JSON.stringify(top));
  return { top, ts: entry.ts };
}
function renderScores(el, list, hlTs = 0) {
  if (!list.length) { el.innerHTML = '<tr><td>NO DIVES ON RECORD // 記録なし</td></tr>'; return; }
  const fmt = ts => {
    const d2 = new Date(ts);
    return `${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')} ` +
           `${String(d2.getHours()).padStart(2, '0')}:${String(d2.getMinutes()).padStart(2, '0')}`;
  };
  el.innerHTML =
    '<tr><th>#</th><th>SCORE</th><th>DEPTH</th><th>LAYER</th><th>TIME</th></tr>' +
    list.map((e, i) =>
      `<tr${e.ts === hlTs ? ' class="new"' : ''}><td>${String(i + 1).padStart(2, '0')}</td>` +
      `<td>${e.s.toLocaleString()}</td><td>${e.d}m</td><td>${e.l}</td><td>${fmt(e.ts)}</td></tr>`).join('');
}

// ---------------- pause ----------------
function setPaused(p) {
  if (p && (G.mode !== 'playing' || G.auto)) return;
  if (G.paused === !!p) return;
  G.paused = !!p;
  G.trigger = false;
  G.tuck = false;
  if (!G.paused && G.freelook) exitFreelook();
  document.body.classList.toggle('paused', G.paused);
  ui.pause.classList.toggle('hidden', !G.paused);
  if (G.paused) renderScores(ui.scores, loadScores());
  if (AU.ctx) (G.paused ? AU.ctx.suspend() : AU.ctx.resume());
  if (G.paused) stopMusic();
  else if (MUSIC.enabled) {
    sfx.uiTick();
    const t = trackForState();
    if (t) playTrack(t, true);
  }
}

function announce(en, jp, warn = false, hold = 1800) {
  ui.announce.querySelector('.en').textContent = en;
  ui.announce.querySelector('.jp').textContent = jp;
  ui.announce.classList.toggle('warn', warn);
  ui.announce.classList.add('show');
  clearTimeout(announce._t);
  announce._t = setTimeout(() => ui.announce.classList.remove('show'), hold);
}
const fxMuted = () => G.auto && !G.demoFX;
function feed(text, cls = '') {
  if (fxMuted()) return;
  const d = document.createElement('div');
  d.textContent = text;
  if (cls) d.className = cls;
  ui.feed.appendChild(d);
  while (ui.feed.children.length > 4) ui.feed.firstChild.remove();
  setTimeout(() => d.remove(), 1200);
}
function chat(kind) {
  if (G.mode !== 'playing' || fxMuted()) return;
  const now = performance.now();
  if (now - (chat._last || 0) < 900) return;
  chat._last = now;
  const lines = CHATTER[kind];
  const d = document.createElement('div');
  d.textContent = 'コダマ ▸ ' + lines[Math.floor(Math.random() * lines.length)];
  ui.chatter.appendChild(d);
  while (ui.chatter.children.length > 3) ui.chatter.firstChild.remove();
  setTimeout(() => d.remove(), 3300);
}
// the defense's voice: FUDO, the hunter-ICE, on its own red channel
// (opposite the KODAMA channel). The Chorister borrows it in gold.
// small "+TRACE" tick floating off the trace bar when an action raises it
function traceTick(txt) {
  const el = $('traceTick');
  if (!el || fxMuted()) return;
  el.textContent = txt;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
function iceLine(pair, gold = false, name = ICE_NAME.jp) {
  if (fxMuted() || !pair) return false;
  const now = performance.now();
  if (now - (iceLine._last || 0) < 1200) return false; // caller may retry
  iceLine._last = now;
  const d = document.createElement('div');
  if (gold) d.className = 'gold';
  d.textContent = `${name} ▸ ` + pair[Math.random() < 0.5 ? 0 : 1];
  ui.ice.appendChild(d);
  while (ui.ice.children.length > 3) ui.ice.firstChild.remove();
  setTimeout(() => d.remove(), 4200);
  if (Math.random() < 0.3) chat('iceTaunt');
  return true;
}
function iceSay(kind) {
  const pool = ICE_LINES[kind];
  if (pool) iceLine(pool[Math.floor(Math.random() * pool.length)]);
}
function flash(cls, peak = 0.5, ms = 140) {
  ui.flash.className = cls;
  ui.flash.style.transition = 'none';
  ui.flash.style.opacity = peak;
  requestAnimationFrame(() => {
    ui.flash.style.transition = `opacity ${ms}ms ease-out`;
    ui.flash.style.opacity = 0;
  });
}

// ---------------- music: the strudel descent-engine score ----------------
const MUSIC = { mod: null, tracks: null, current: null, layer: -1, enabled: true, loading: false };
async function musicInit() {
  if (MUSIC.mod || MUSIC.loading) return;
  MUSIC.loading = true;
  try {
    const [mod, tr] = await Promise.all([
      import('./music/vendor/strudel-web.mjs'),
      import('./music/tracks.js'),
    ]);
    mod.initStrudel();
    MUSIC.mod = mod;
    MUSIC.tracks = tr.tracks;
    console.log('[music] engine ready');
    applyVolumes();
    const t = trackForState();
    if (t) playTrack(t);
  } catch (e) {
    console.warn('[music] failed to load:', e);
  }
  MUSIC.loading = false;
}
// the one honest answer to "what should be playing right now?"
// null = intentional silence (pause menu). Every resume path (unmute,
// async engine load, unpause) goes through this so none can desync.
function trackForState() {
  if (G.freelook) return 'freelook';
  if (G.paused) return null;
  if (G.mode === 'dead') return 'gameover';
  if (G.mode === 'won' || G.auto || G.mode !== 'playing') return 'title';
  return G.traced > 0 ? 'traced' : 'dive';
}
function playTrack(name, force = false) {
  if (!MUSIC.mod || !MUSIC.enabled) return;
  if (MUSIC.current === name && MUSIC.layer === G.layer && !force) return;
  MUSIC.current = name;
  MUSIC.layer = G.layer;
  console.log(`[music] -> ${name} (layer ${G.layer})`);
  MUSIC.mod.evaluate(MUSIC.tracks[name]({ layer: G.layer }).trim())
    .catch(e => console.warn('[music] eval error:', e.message));
}
function stopMusic() {
  if (MUSIC.mod) MUSIC.mod.hush();
  MUSIC.current = null;
}
function setMuted(m) {
  MUSIC.enabled = !m;
  if (m) stopMusic();
  else { const t = trackForState(); if (t) playTrack(t, true); }
  applyVolumes();
  feed(m ? 'AUDIO MUTED // 消音' : 'AUDIO ON // 音声', '');
}

// ---------------- audio: shared engine (sfx.js) ----------------
setFxMuted(fxMuted);

// ---------------- game state ----------------
const G = {
  mode: 'title',          // title | playing | dead
  auto: true,             // autopilot (attract mode / demo)
  time: 0, dist: 0, speed: 46, layer: 0,
  score: 0, chain: 0, hits: 0,
  integrity: 4, energy: 3, energyT: 0,
  trace: 0, traced: 0, tracedSurvive: 0,
  invuln: 0, slowmo: 0, shake: 0, fovKick: 0,
  nextGate: 90, nextMine: 55, nextHunter: 260,
  alarmT: 0, deadT: 0, intro: 0, introFired: false, introFx: false, introE: 0,
  best: +(localStorage.getItem('ab_best') || 0),
};
const mult = () => Math.min(8, 1 + G.chain * 0.5);

const player = {
  x: 0, y: 0, tx: 0, ty: 0,
  group: null, trail: null, trailPts: [],
};
const kodamas = [];      // two escort units
const gates = [], mines = [], hunters = [], bullets = [], spikes = [], bursts = [], glyphs = [];
const ferals = [], shells = [], keepers = []; // deep-strata hostiles
const limpets = []; // trace parasites: dodge the lunge or shoot them off

// ---------------- lights (only affect GLB PBR materials) ----------------
scene.add(new THREE.AmbientLight(0x8090b0, 0.6));
{
  const key = new THREE.DirectionalLight(0xfff0d0, 1.5);
  key.position.set(4, 8, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4db8ff, 1.1);
  rim.position.set(-6, -4, -8);
  scene.add(rim);
}
// soft lamp riding above the diver so the player avatar always reads
const playerLight = new THREE.PointLight(0xffe8c0, 10, 14, 1.6);
scene.add(playerLight);

// ---------------- generated GLB models (optional, graceful fallback) ----------------
const MODELS = {};
let coreShrine = null;
const MODEL_TUNE = {
  // glow = emissiveIntensity; the diver's face/visor emissive blows out bloom at 2.2
  diver:         { size: 1.6,  rot: [Math.PI / 2, 0, Math.PI], pose: 'swan', glow: 0.75 },
  // glowTint re-tints the emissive map warm so the caged globe reads molten, not teal
  escort:        { size: 0.9,  rot: [0, Math.PI, 0], muzzle: [0, -0.12, -0.5], glow: 2.2, glowTint: 0xffb066 },
  hunter:        { size: 1.7,  rot: [0, 0, 0] },
  mine:          { size: 1.1,  rot: [0, 0, 0] },
  keeper:        { size: 1.5,  rot: [0, Math.PI, 0], glow: 1.6 },
  limpet:        { size: 0.55, rot: [0, 0, 0], glow: 2.4 },
  // core-shrine is now an additive billboard of the reference render itself
};
const mixers = [];

// swan-dive hold: additive bone rotations over the bind pose (degrees, XYZ)
const swan = { bones: {}, bind: {}, ready: false };
const SWAN_POSE = {
  // rig axes (probed numerically 2026-07-13): X+ sweeps toward the feet and
  // mirrors with the SAME sign; Z pushes dorsal but mirrors OPPOSITE (L-, R+)
  LeftShoulder:  [5, 0, -4],   RightShoulder: [5, 0, 4],
  LeftArm:       [58, 0, -14], RightArm:      [58, 0, 14],
  LeftForeArm:   [14, 0, -4],  RightForeArm:  [14, 0, 4],
  Spine:         [-12, 0, 0],
  Spine01:       [-9, 0, 0],
  Spine02:       [-7, 0, 0],
  neck:          [-10, 0, 0],
  Head:          [-14, 0, 0],
  LeftUpLeg:     [0, 0, 0],   RightUpLeg:    [0, 0, 0],
  LeftLeg:       [0, 0, 0],   RightLeg:      [0, 0, 0],
  LeftFoot:      [22, 0, 0],  RightFoot:     [22, 0, 0],
};
const _swanE = new THREE.Euler(), _swanQ = new THREE.Quaternion();
function applySwan(time) {
  if (!swan.ready) return;
  const sway = Math.sin(time * 1.05);
  const sway2 = Math.sin(time * 0.7 + 1.3);
  const tk = G.tuckK || 0; // tuck: arms pin to the sides, spine straightens, a dart
  for (const [name, d] of Object.entries(SWAN_POSE)) {
    const b = swan.bones[name];
    if (!b) continue;
    let [dx, dy, dz] = d;
    if (name.endsWith('Arm') && !name.includes('Fore')) {
      // X = sweep on this rig (probed 2026-07-13); split across shoulder+elbow
      dx += sway * 2.2 * (1 - tk) + tk * 16;
    }
    if (name.includes('ForeArm')) dx += tk * 10; // the elbow takes the rest
    if (name.startsWith('Spine')) dx += sway2 * 1.2 * (1 - tk) + tk * 10;
    if (name === 'Head') dx += sway * 1.5 * (1 - tk) + tk * 6;
    if (name.endsWith('Foot')) dx += tk * 12; // toes pointed
    _swanE.set(THREE.MathUtils.degToRad(dx), THREE.MathUtils.degToRad(dy), THREE.MathUtils.degToRad(dz));
    b.quaternion.copy(swan.bind[name]).multiply(_swanQ.setFromEuler(_swanE));
  }
}

{
  const loader = new GLTFLoader();
  for (const name of Object.keys(MODEL_TUNE)) {
    // an animated variant wins over the static mesh when both exist
    (async () => {
      let url = null;
      for (const cand of [`assets/models/${name}-anim.glb`, `assets/models/${name}.glb`]) {
        try {
          if ((await fetch(cand, { method: 'HEAD' })).ok) { url = cand; break; }
        } catch { /* keep looking */ }
      }
      if (!url) return;
      loader.load(url, gltf => {
        const t = MODEL_TUNE[name];
        const obj = gltf.scene;
        const box = new THREE.Box3().setFromObject(obj);
        obj.position.sub(box.getCenter(new THREE.Vector3()));
        const dim = box.getSize(new THREE.Vector3());
        const wrap = new THREE.Group();
        wrap.add(obj);
        obj.scale.setScalar(t.size / Math.max(dim.x, dim.y, dim.z, 0.001));
        obj.position.multiplyScalar(obj.scale.x);
        wrap.rotation.set(...t.rot);
        obj.traverse(o => {
          o.userData.sharedGeo = true; // clones share geometry; never dispose
          if (o.isMesh && o.material) {
            if ('emissiveIntensity' in o.material) o.material.emissiveIntensity = MODEL_TUNE[name].glow ?? 2.2;
            if (MODEL_TUNE[name].glowTint && o.material.emissive) o.material.emissive.setHex(MODEL_TUNE[name].glowTint);
            if (name === 'core-shrine') o.material.fog = false; // sits beyond fog end
          }
        });
        if (MODEL_TUNE[name].pose === 'swan') {
          // procedural swan-dive hold: pose the skeleton, ignore baked clips
          obj.traverse(o => {
            if (o.isBone) { swan.bones[o.name] = o; swan.bind[o.name] = o.quaternion.clone(); }
          });
          swan.ready = true;
        } else if (gltf.animations && gltf.animations.length) {
          const clip = gltf.animations[0];
          // strip root-motion translation so the clip animates in place
          clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.position'));
          const mixer = new THREE.AnimationMixer(obj);
          const action = mixer.clipAction(clip);
          action.timeScale = MODEL_TUNE[name].animSpeed || 1;
          action.play();
          mixers.push(mixer);
        }
        MODELS[name] = wrap;
        applyModel(name);
        console.log(`[AB] model loaded: ${name} (${url}, ${gltf.animations?.length || 0} clips)`);
      });
    })();
  }
}
const outlineMats = {};
function outlineMat(offset, opacity) {
  const key = offset + '/' + opacity;
  if (outlineMats[key]) return outlineMats[key];
  const m = new THREE.MeshBasicMaterial({
    color: 0xffc860, side: THREE.BackSide, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  m.onBeforeCompile = s => {
    // `normal` (the raw attribute) is always declared; `objectNormal` only exists
    // when the basic material is skinned, so non-skinned outline shells broke on it
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += normalize(normal) * ' + offset.toFixed(4) + ';');
  };
  outlineMats[key] = m;
  return m;
}
function addOutline(tpl, offset = 0.018, opacity = 0.5) {
  const mat = outlineMat(offset, opacity);
  const adds = [];
  tpl.traverse(o => {
    if (o.isSkinnedMesh) {
      const out = new THREE.SkinnedMesh(o.geometry, mat);
      out.bind(o.skeleton, o.bindMatrix);
      out.userData.outline = true;
      out.userData.sharedGeo = true;
      out.frustumCulled = false;
      adds.push([o.parent, out]);
    } else if (o.isMesh) {
      const out = new THREE.Mesh(o.geometry, mat);
      out.position.copy(o.position); out.quaternion.copy(o.quaternion); out.scale.copy(o.scale);
      out.userData.outline = true;
      out.userData.sharedGeo = true;
      adds.push([o.parent, out]);
    }
  });
  for (const [parent, out] of adds) parent.add(out);
}
function stripOutline(root) {
  const dead = [];
  root.traverse(o => { if (o.userData.outline) dead.push(o); });
  for (const o of dead) o.parent.remove(o);
  return root;
}
function applyModel(name) {
  const tpl = MODELS[name];
  if (!tpl) return;
  if (name === 'diver' && player.fig) {
    player.fig.children.forEach(c => c.visible = false);
    addOutline(tpl, 0.018, 0.5);
    player.fig.add(tpl);
  } else if (name === 'escort') {
    for (const t of kodamas) {
      t.group.children.forEach(c => c.visible = false);
      const inst = tpl.clone(true);
      addOutline(inst, 0.014, 0.3);
      t.group.add(inst);
      const mk = (color, opacity, scale, pos, xray) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, color, transparent: true, opacity,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: !xray,
        }));
        s.scale.setScalar(scale);
        s.position.set(...pos);
        s.userData.ownMat = true;
        t.group.add(s);
        return s;
      };
      // molten heart: white-hot point in the caged globe + orange bleed
      // (x-ray so the globe surface doesn't swallow it; center probed 2026-07-13)
      t.heart = [
        mk(0xfff4d8, 0.9, 0.2, [0.05, 0.07, 0.08], true),
        mk(0xff8a24, 0.5, 0.5, [0.05, 0.07, 0.08], true),
      ];
      // sensor eyes: the three orbs baked into the shards (front lantern + rear pair)
      t.eyes = [
        mk(0xffc860, 0.7, 0.11, [-0.04, -0.19, -0.18]),
        mk(0xffc860, 0.7, 0.11, [-0.096, -0.05, 0.17]),
        mk(0xffc860, 0.7, 0.11, [0.105, -0.053, 0.17]),
      ];
    }
  } else if (name === 'core-shrine') {
    tpl.position.copy(mandala.position);
    scene.add(tpl);
    coreShrine = tpl;
  }
  // hunter and mine templates are picked up at spawn time
}

// ---------------- world dressing ----------------
const world = new THREE.Group();
scene.add(world);

// concentric barrier rings (hexagons — the shaft you fall down)
const rings = [];
{
  const hex = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 7 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      return new THREE.Vector3(Math.cos(a) * TUNNEL_R, Math.sin(a) * TUNNEL_R, 0);
    })
  );
  const bright = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.22 });
  const goldDim = new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.16 });
  // radial tick marks (mandala detail) reused across rings
  const tickPts = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    tickPts.push(
      new THREE.Vector3(Math.cos(a) * (TUNNEL_R - 0.28), Math.sin(a) * (TUNNEL_R - 0.28), 0),
      new THREE.Vector3(Math.cos(a) * TUNNEL_R, Math.sin(a) * TUNNEL_R, 0));
  }
  const ticks = new THREE.BufferGeometry().setFromPoints(tickPts);
  for (let i = 0; i < RING_COUNT; i++) {
    const gold = i % 8 === 4;
    const line = new THREE.Line(hex, gold ? goldDim : (i % 4 === 0 ? bright : M.dim));
    line.position.z = -i * RING_GAP;
    line.rotation.z = (i % 2) * (Math.PI / 6);
    if (i % 5 === 0) {
      const inner = new THREE.Line(hex, M.dim);
      inner.scale.setScalar(0.45);
      inner.rotation.z = Math.PI / 6;
      line.add(inner);
    }
    if (i % 4 === 0) line.add(new THREE.LineSegments(ticks, gold ? goldDim : M.dim));
    world.add(line);
    rings.push(line);
  }
}
// outer shaft
const outer = new THREE.Mesh(
  new THREE.CylinderGeometry(11, 11, 500, 8, 24, true),
  new THREE.MeshBasicMaterial({ color: COL.dim, wireframe: true, transparent: true, opacity: 0.14 })
);
outer.rotation.x = Math.PI / 2;
outer.position.z = -200;
scene.add(outer);

// ---------------- environment from reference art ----------------
{
  const texLoader = new THREE.TextureLoader();
  // megastructure canyon wrapping the shaft (reference: dark city canyon)
  texLoader.load('assets/strata-wall.jpg', tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.repeat.set(3, 2);
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(55, 55, 720, 32, 1, true),
      new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, transparent: true, opacity: 0.38,
        color: 0x99a4b8, // keep the canyon a backdrop, not a competitor
      }));
    cyl.rotation.x = Math.PI / 2;
    cyl.position.z = -240;
    cyl.renderOrder = -3;
    scene.add(cyl);
    world.userData.canyon = cyl;
  });
  // true equirect skybox (composited from the reference art): background + IBL
  texLoader.load('assets/sky/skybox.jpg', tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    scene.backgroundIntensity = 0.7;
    scene.environment = tex;
    scene.environmentIntensity = 0.55;
  });
  // down-the-shaft matte backdrops; amber early, violet in the deep strata
  const backdrop = (file, z, op) => {
    texLoader.load(file, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1480, 833),
        new THREE.MeshBasicMaterial({
          map: tex, fog: false, depthWrite: false, transparent: true, opacity: op,
          color: 0x8a93a5, // pushed back: the backdrop is 500m away, not wallpaper
        }));
      plane.position.set(0, 0, z);
      plane.renderOrder = -5;
      scene.add(plane);
      world.userData[file.includes('violet') ? 'backViolet' : 'backAmber'] = plane;
    });
  };
  backdrop('assets/strata-shaft-amber.jpg', -540, 1);
  backdrop('assets/strata-shaft-deep.jpg', -542, 0);
  // the golden core machine, additive so black reads as void (reference mandala)
  texLoader.load('assets/strata-core.jpg', tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 36),
      new THREE.MeshBasicMaterial({ map: tex, fog: false, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 }));
    disc.position.z = -385;
    disc.renderOrder = -2;
    scene.add(disc);
    world.userData.coreDisc = disc;
  });
}

// deep mandala core — the barrier heart you are falling toward (MMI style)
const mandala = new THREE.Group();
{
  const circle = (r, seg = 72) => new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: seg + 1 }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
    }));
  const gold = new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.3, fog: false });
  const pale = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.14, fog: false });
  const inner = new THREE.Group(), outer = new THREE.Group();
  for (const r of [4, 6.5, 9]) inner.add(new THREE.Line(circle(r), gold));
  for (const r of [13, 17.5, 22]) outer.add(new THREE.Line(circle(r), pale));
  const spokes = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    spokes.push(new THREE.Vector3(Math.cos(a) * 9.4, Math.sin(a) * 9.4, 0),
                new THREE.Vector3(Math.cos(a) * 12.6, Math.sin(a) * 12.6, 0));
  }
  inner.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), gold));
  const spokes2 = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13;
    spokes2.push(new THREE.Vector3(Math.cos(a) * 13, Math.sin(a) * 13, 0),
                 new THREE.Vector3(Math.cos(a) * 22, Math.sin(a) * 22, 0));
  }
  outer.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes2), pale));
  mandala.add(inner, outer);
  mandala.userData = { inner, outer };
  mandala.position.z = -370;
  scene.add(mandala);
}

// lattice data nodes drifting outside the shaft
const nodes = [];
{
  const icoEdges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 0));
  const nodeMat = new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.28 });
  const nodeMat2 = new THREE.LineBasicMaterial({ color: 0x6a7c96, transparent: true, opacity: 0.3 });
  for (let i = 0; i < 7; i++) {
    const grp = new THREE.Group();
    grp.add(new THREE.LineSegments(icoEdges, i % 2 ? nodeMat : nodeMat2));
    const coreOct = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.45)), i % 2 ? nodeMat2 : nodeMat);
    grp.add(coreOct);
    const a = Math.random() * Math.PI * 2, r = 8.5 + Math.random() * 4;
    grp.position.set(Math.cos(a) * r, Math.sin(a) * r, -Math.random() * 430);
    grp.userData.spin = 0.15 + Math.random() * 0.3;
    const tag = labelSprite(`FILE ${1000 + Math.floor(Math.random() * 9000)}`);
    tag.position.y = -1.7;
    grp.add(tag);
    scene.add(grp);
    nodes.push(grp);
  }
}

// vertical katakana data streams (columns of glyphs)
const streams = [];

// rushing data dust (speed cue)
let dust, dustPos;
{
  const N = 500;
  dustPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = Math.sin(a) * r;
    dustPos[i * 3 + 2] = -Math.random() * 430;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x8fa8c8, size: 0.12, transparent: true, opacity: 0.7,
    map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);
}

// tiny label plates ("FILE 3159", "GATE-4C") — straight from the MMI dive pages
function labelSprite(text, color = '#a8c0e0', op = 0.55) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 48;
  const cx = cv.getContext('2d');
  cx.font = '700 30px Menlo, monospace';
  cx.fillStyle = color;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(text, 128, 26);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, opacity: op, depthWrite: false,
  }));
  s.scale.set(2.6, 0.49, 1);
  return s;
}

// floating katakana glyphs
const glyphTex = [];
{
  const chars = 'ストラタシンソウダイバア深層降下聖歌回線電脳';
  for (const ch of chars) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    cx.font = '48px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = '#a8c0e0'; cx.fillText(ch, 32, 34);
    glyphTex.push(new THREE.CanvasTexture(cv));
  }
}
function spawnGlyph() {
  const tex = glyphTex[Math.floor(Math.random() * glyphTex.length)];
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.25, depthWrite: false }));
  const a = Math.random() * Math.PI * 2, r = 6.5 + Math.random() * 3.5;
  s.position.set(Math.cos(a) * r, Math.sin(a) * r, SPAWN_Z * Math.random());
  const sc = 0.5 + Math.random() * 0.8;
  s.scale.set(sc, sc, 1);
  scene.add(s);
  glyphs.push(s);
}
for (let i = 0; i < 26; i++) spawnGlyph();
// build the vertical glyph stream columns
for (let c = 0; c < 6; c++) {
  const grp = new THREE.Group();
  const n = 5 + Math.floor(Math.random() * 3);
  for (let j = 0; j < n; j++) {
    const tex = glyphTex[Math.floor(Math.random() * glyphTex.length)];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.16 + Math.random() * 0.14, depthWrite: false,
      color: Math.random() < 0.3 ? COL.amber : 0xa8c0e0,
    }));
    s.position.set(0, 0, j * 1.1);
    const sc = 0.55 + Math.random() * 0.3;
    s.scale.set(sc, sc, 1);
    grp.add(s);
  }
  const a = Math.random() * Math.PI * 2, r = 7.5 + Math.random() * 3;
  grp.position.set(Math.cos(a) * r, Math.sin(a) * r, -Math.random() * 430);
  scene.add(grp);
  streams.push(grp);
}

// ---------------- player: the diver, falling ----------------
{
  const g = new THREE.Group();
  const fig = new THREE.Group();
  const strip = pts => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p))), M.ink);
  // skydive arch: head down the shaft, arms swept, knees bent, feet trailing up
  fig.add(strip([[0, 0.05, -0.42], [0, 0.02, -0.15], [0, 0, 0.05]]));            // spine
  fig.add(strip([[-0.24, 0.04, -0.36], [0.24, 0.04, -0.36]]));                    // shoulders
  fig.add(strip([[-0.24, 0.04, -0.36], [-0.14, 0, 0.02]]));                       // torso L
  fig.add(strip([[0.24, 0.04, -0.36], [0.14, 0, 0.02]]));                         // torso R
  fig.add(strip([[-0.14, 0, 0.02], [0.14, 0, 0.02]]));                            // hips
  fig.add(strip([[-0.24, 0.04, -0.36], [-0.52, 0.16, -0.12], [-0.66, 0.26, 0.14]])); // arm L
  fig.add(strip([[0.24, 0.04, -0.36], [0.52, 0.16, -0.12], [0.66, 0.26, 0.14]]));    // arm R
  fig.add(strip([[-0.12, 0, 0.02], [-0.2, 0.08, 0.5], [-0.27, 0.22, 0.92]]));     // leg L
  fig.add(strip([[0.12, 0, 0.02], [0.2, 0.08, 0.5], [0.27, 0.22, 0.92]]));        // leg R
  fig.add(strip([[0, 0.14, -0.5], [0, 0.24, -0.26]]));                            // hair
  fig.add(strip([[0.07, 0.12, -0.52], [0.12, 0.21, -0.3]]));
  fig.add(strip([[-0.07, 0.12, -0.52], [-0.12, 0.21, -0.3]]));
  const head = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.11, 0)), M.ink);
  head.position.set(0, 0.07, -0.52);
  fig.add(head);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), M.amberSolid);
  core.position.set(0, 0.02, -0.22);
  fig.add(core);
  fig.rotation.x = -0.16; // slight head-down arch
  fig.scale.setScalar(1.22);
  g.add(fig);
  player.fig = fig;
  // halo: keeps her readable against the deep-strata chaos
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: COL.amber, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.scale.setScalar(2.0);
  aura.position.z = -0.6; // behind her: rim halo, never a veil over the model
  g.add(aura);
  player.aura = aura;
  // breaker armed: red hex ring orbiting the diver while a charge is held
  const brkRing = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0);
      })),
    new THREE.LineBasicMaterial({
      color: COL.red, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  brkRing.visible = false;
  g.add(brkRing);
  player.brkRing = brkRing;
  // glowing wake: sprite chain along her recent path
  player.wake = [];
  for (let i = 0; i < 7; i++) {
    const w = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: COL.amber, transparent: true, opacity: 0.3 * (1 - i / 7),
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    w.scale.setScalar(0.9 - i * 0.09);
    scene.add(w);
    player.wake.push(w);
  }
  player.group = g;
  scene.add(g);

  // trail
  const tg = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 24 }, () => new THREE.Vector3())
  );
  player.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.2 }));
  scene.add(player.trail);
}

// ---------------- kodama escorts ----------------
function buildKodama() {
  const g = new THREE.Group();
  const mat = M.blue;
  // pod body: sphere + rear pod
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.3, 6, 4)), mat);
  g.add(body);
  const pod = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.28, 0.22, 0.3)), mat);
  pod.position.set(0, 0.16, 0.32);
  g.add(pod);
  // four legs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 0.24, -0.05, Math.sin(a) * 0.24),
      new THREE.Vector3(Math.cos(a) * 0.5, -0.34, Math.sin(a) * 0.5),
      new THREE.Vector3(Math.cos(a) * 0.44, -0.62, Math.sin(a) * 0.44),
    ]);
    g.add(new THREE.Line(leg, mat));
  }
  // eye
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.blueSolid);
  eye.position.set(0, 0.05, -0.3);
  g.add(eye);
  scene.add(g);
  return g;
}
function buildTrail(n) {
  const sprites = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffb040, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.userData.ownMat = true;
    s.visible = false;
    scene.add(s);
    sprites.push(s);
  }
  return { sprites, hist: [], t: 0 };
}
for (const side of [-1, 1]) {
  kodamas.push({
    side, alive: true, respawn: 0, fireT: 1 + Math.random(),
    bob: Math.random() * 6.28, group: buildKodama(), trail: buildTrail(12),
  });
}
// afterimage ribbon (the bike-chase streak): sample the escort's position at a
// fixed cadence; each sample drifts back toward the camera and fades
function trailTick(t, dt) {
  const tr = t.trail;
  if (!tr) return;
  tr.t -= dt;
  const speedK = THREE.MathUtils.clamp((G.speed || 0) / 90, 0, 1.4);
  if (t.alive && G.mode === 'playing' && !G.paused && tr.t <= 0) {
    tr.t = 0.028;
    tr.hist.unshift({ x: t.group.position.x, y: t.group.position.y, z: t.group.position.z, age: 0 });
    if (tr.hist.length > tr.sprites.length) tr.hist.pop();
  }
  for (let i = 0; i < tr.sprites.length; i++) {
    const s = tr.sprites[i], h = tr.hist[i];
    if (!h || !t.alive) { s.visible = false; continue; }
    h.age += dt;
    h.z += (14 + 30 * speedK) * dt; // stream back toward the camera
    const k = 1 - i / tr.sprites.length;
    s.visible = true;
    s.position.set(h.x, h.y, h.z);
    s.scale.setScalar(0.34 * k + 0.06);
    s.material.opacity = 0.16 * k * speedK;
  }
}

// ---------------- gate factory ----------------
M.circuit      = new THREE.LineBasicMaterial({ color: COL.ink,   transparent: true, opacity: 0.35 });
M.circuitAmber = new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.8 });
M.circuitRed   = new THREE.LineBasicMaterial({ color: COL.red,   transparent: true, opacity: 0.6 });
M.padPoints    = new THREE.PointsMaterial({
  color: COL.amber, size: 0.14, transparent: true, opacity: 0.85,
  map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending,
});

const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
function pushRad(arr, a, r1, r2) {
  const [x1, y1] = polar(a, r1), [x2, y2] = polar(a, r2);
  arr.push(x1, y1, 0, x2, y2, 0);
}
function pushArc(arr, a1, a2, r) {
  const n = Math.max(2, Math.ceil((Math.abs(a2 - a1) * r) / 0.3));
  let [px, py] = polar(a1, r);
  for (let k = 1; k <= n; k++) {
    const [x, y] = polar(a1 + ((a2 - a1) * k) / n, r);
    arr.push(px, py, 0, x, y, 0);
    px = x; py = y;
  }
}
// one kintsugi vein: a jagged fracture wandering across the wedge, gold
// flecks at the break points (was: PCB random-walk traces)
function pushTrace(a0, a1, r0, r1, main, acc, pads) {
  const arr = Math.random() < 0.16 ? acc : main;
  let a = a0 + Math.random() * (a1 - a0);
  let r = r0 + Math.random() * (r1 - r0);
  pads.push(...polar(a, r), 0);
  const steps = 3 + Math.floor(Math.random() * 4);
  const drift = Math.random() < 0.5 ? -1 : 1; // veins tend one way, like strata slip
  for (let s = 0; s < steps; s++) {
    const na = THREE.MathUtils.clamp(
      a + drift * (0.1 + Math.random() * 0.35) * (a1 - a0) * (Math.random() < 0.25 ? -1 : 1),
      a0, a1);
    const nr = THREE.MathUtils.clamp(r + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.3), r0, r1);
    const [x1, y1] = polar(a, r), [x2, y2] = polar(na, nr);
    arr.push(x1, y1, 0, x2, y2, 0);
    a = na; r = nr;
    if (Math.random() < 0.3) pads.push(x2, y2, 0); // fleck at the break
  }
  pads.push(...polar(a, r), 0);
}

function wedgeGeometry(a0, a1, r0 = 0.55, r1 = TUNNEL_R - 0.15) {
  const pts = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1));
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
}
M.amberEdge = new THREE.LineBasicMaterial({ color: COL.amber, transparent: true, opacity: 0.95 });
function spawnGate() {
  const L = G.layer;
  const W = [10, 12, 14, 16][Math.floor(Math.random() * 4)]; // wedge count varies per gate
  const step = (Math.PI * 2) / W;
  const mainWedges = Math.max(2, Math.round((L < 2 ? 0.24 : 0.17) * W)); // keep gap arc roughly stable
  const mainStart = Math.floor(Math.random() * W);
  const hot = Math.random() < Math.min(0.2 + L * 0.06, 0.55);
  const hotStart = hot ? (mainStart + mainWedges + 2 + Math.floor(Math.random() * (W - mainWedges - 4))) % W : -1;
  const group = new THREE.Group();

  // generative circuitry buffers for the whole disc
  const mainSegs = [], accSegs = [], pads = [];
  const rIn = 0.9, rOut = TUNNEL_R - 0.3;

  // concentric band boundaries — the panel look from the reference discs
  const bands = [];
  {
    const nB = 2 + Math.floor(Math.random() * 2);
    let r = rIn;
    for (let b = 0; b < nB; b++) {
      const rEnd = rIn + (rOut - rIn) * ((b + 1) / nB) - 0.1;
      bands.push([r, rEnd]);
      r = rEnd + 0.1;
    }
  }
  for (let i = 0; i < W; i++) {
    if (((i - mainStart + W) % W) < mainWedges) continue; // safe gap
    if (i === hotStart) continue;                          // hot lane
    const a0 = i * step + 0.02, a1 = (i + 1) * step - 0.02;
    for (const [r0, r1] of bands) {
      const geo = wedgeGeometry(a0, a1, r0, r1);
      const fill = new THREE.Mesh(geo, hot ? M.fillRed : M.fillInk);
      fill.material = fill.material.clone();
      fill.material.opacity *= 0.6 + Math.random() * 0.8; // uneven panel glow
      fill.userData.ownMat = true;
      fill.userData.midAngle = (a0 + a1) / 2;
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), hot ? M.red : M.amberEdge);
      edge.userData.panelEdge = true;
      edge.userData.midAngle = (a0 + a1) / 2;
      group.add(fill, edge);
    }
    // PCB traces: 2-4 random walks per wedge
    const n = 2 + Math.floor(Math.random() * 3);
    for (let t = 0; t < n; t++) pushTrace(a0, a1, rIn, rOut, mainSegs, accSegs, pads);
    // band arcs across the wedge at random radii
    if (Math.random() < 0.7) pushArc(mainSegs, a0, a1, rIn + Math.random() * (rOut - rIn));
    // strata ticks: short radial marks near the rim (was pin rows)
    if (Math.random() < 0.25) {
      const pins = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < pins; p++) {
        const pa = a0 + ((p + 0.5) / pins) * (a1 - a0);
        pushRad(mainSegs, pa, rOut - 0.45, rOut - 0.1);
      }
    }
    // inlay block: small arc-rect outline, a repaired slab
    if (Math.random() < 0.18) {
      const ba0 = a0 + Math.random() * (a1 - a0) * 0.5;
      const ba1 = Math.min(a1, ba0 + (a1 - a0) * (0.2 + Math.random() * 0.3));
      const br = rIn + 0.5 + Math.random() * (rOut - rIn - 1.5);
      const bh = 0.35 + Math.random() * 0.6;
      pushArc(mainSegs, ba0, ba1, br);
      pushArc(mainSegs, ba0, ba1, br + bh);
      pushRad(mainSegs, ba0, br, br + bh);
      pushRad(mainSegs, ba1, br, br + bh);
    }
  }
  // concentric dressing rings, random count and radii
  for (let c = 0, nC = 1 + Math.floor(Math.random() * 3); c < nC; c++) {
    pushArc(mainSegs, 0, Math.PI * 2, rIn + Math.random() * (rOut - rIn));
  }
  const segGeo = (arr) => {
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    return g2;
  };
  if (mainSegs.length) group.add(new THREE.LineSegments(segGeo(mainSegs), M.circuit));
  if (accSegs.length) group.add(new THREE.LineSegments(segGeo(accSegs), hot ? M.circuitRed : M.circuitAmber));
  if (pads.length) group.add(new THREE.Points(segGeo(pads), M.padPoints));
  const gaps = [{
    center: (mainStart + mainWedges / 2) * step,
    half: (mainWedges * step) / 2,
    hot: false,
    a0: mainStart * step, a1: (mainStart + mainWedges) * step,
  }];
  if (hot) gaps.push({
    center: (hotStart + 0.5) * step,
    half: step / 2,
    hot: true,
    a0: hotStart * step, a1: (hotStart + 1) * step,
  });
  // edge ticks marking each gap; amber for the hot lane
  for (const gap of gaps) {
    for (const a of [gap.a0, gap.a1]) {
      const tick = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * (TUNNEL_R - 0.1), Math.sin(a) * (TUNNEL_R - 0.1), 0),
        new THREE.Vector3(Math.cos(a) * (TUNNEL_R + 0.6), Math.sin(a) * (TUNNEL_R + 0.6), 0),
      ]);
      group.add(new THREE.Line(tick, gap.hot ? M.amber : M.dim));
    }
    if (gap.hot) {
      const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), M.amberSolid);
      b.position.set(Math.cos(gap.center) * (TUNNEL_R - 1.1), Math.sin(gap.center) * (TUNNEL_R - 1.1), 0);
      group.add(b);
    } else {
      // cyan chevron trail pointing into the safe gap (reference disc arrows)
      const chevPts = [];
      for (let k = 0; k < 3; k++) {
        const r = TUNNEL_R + 0.7 + k * 0.55;
        const [tx2, ty2] = polar(gap.center, r - 0.32);
        const [w1x, w1y] = polar(gap.center - 0.045, r);
        const [w2x, w2y] = polar(gap.center + 0.045, r);
        chevPts.push(new THREE.Vector3(w1x, w1y, 0), new THREE.Vector3(tx2, ty2, 0),
                     new THREE.Vector3(tx2, ty2, 0), new THREE.Vector3(w2x, w2y, 0));
      }
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(chevPts), M.blue));
    }
    // service plate outside the gap: stamped GATE / STAGE labels
    const plate = labelSprite(
      gap.hot ? `HOT-${Math.floor(Math.random() * 90 + 10)}` : `GATE-${(Math.random() * 255 | 0).toString(16).toUpperCase().padStart(2, '0')}`,
      gap.hot ? '#ffb020' : '#a8c0e0', gap.hot ? 0.9 : 0.6);
    plate.position.set(Math.cos(gap.center) * (TUNNEL_R + 1.5), Math.sin(gap.center) * (TUNNEL_R + 1.5), 0);
    group.add(plate);
  }
  group.position.z = SPAWN_Z;
  world.add(group);
  gates.push({
    group, hot, gaps, passed: false,
    rotSpeed: hot
      ? (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.25 + L * 0.03)
      : (L >= 4 ? (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.15) : 0),
  });
}
function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
    if (o.material && o.userData.ownMat) o.material.dispose();
  });
  g.parent && g.parent.remove(g);
}

// ---------------- hazards ----------------
// TRACE LIMPET: a parasite that telegraphs, lunges, and latches. Latched,
// it multiplies trace gain x4 until the player shoots it off (a free shot —
// the escorts refuse to fire at her hull). Never spawns during TRACED.
let limpetFx = null;
function setLimpetFx(on) {
  if (on && !limpetFx) {
    limpetFx = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff3040, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    limpetFx.scale.setScalar(1.7);
    limpetFx.position.set(0.35, -0.25, 0.3);
    limpetFx.userData.ownMat = true;
    player.group.add(limpetFx);
  }
  if (limpetFx) limpetFx.visible = on;
}
function spawnLimpet() {
  const g = new THREE.Group();
  if (MODELS.limpet) {
    g.add(MODELS.limpet.clone(true));
  } else {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.26), M.redSolid));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.44)), M.red));
  }
  const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2.5;
  g.position.set(Math.cos(a) * r, Math.sin(a) * r, SPAWN_Z);
  world.add(g);
  limpets.push({ group: g, state: 'approach', holdT: 1.15, tx: 0, ty: 0, spin: 1 + Math.random() });
  // (the "it's latched on you!" chatter waits until it actually latches)
}

// fairness: nothing spawns in the 40m blind shadow behind a gate disc —
// a mine 26m behind an opaque gate at speed 115 was 0.23s of warning
function clearOfGates(z) {
  for (let pass = 0; pass < 2; pass++)
    for (const g of gates) {
      const d = g.group.position.z - z;
      if (d > 0 && d < 40) z = g.group.position.z - 40;
    }
  return z;
}
function spawnMineCluster() {
  const n = 1 + Math.floor(Math.random() * Math.min(1 + G.layer, 5));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * (PLAY_R - 0.4);
    const g = new THREE.Group();
    if (MODELS.mine) {
      g.add(MODELS.mine.clone(true));
    } else {
      const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.55)), M.ink);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), M.redSolid);
      g.add(shell, core);
    }
    g.position.set(Math.cos(a) * r, Math.sin(a) * r, clearOfGates(SPAWN_Z - i * 26));
    world.add(g);
    mines.push({ group: g, grazed: false, spin: 0.4 + Math.random() });
  }
}
function spawnHunter(zOverride, elite = false) {
  const g = new THREE.Group();
  if (MODELS.hunter) {
    g.add(MODELS.hunter.clone(true));
  } else {
    const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(0.7)), M.red);
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 13 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0);
        })
      ), M.red
    );
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), M.redSolid);
    g.add(body, ring, core);
  }
  if (elite) {
    // FUDO's own shell: brighter, bigger, harder to crack
    g.traverse(o => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.userData.ownMat = true;
        if (o.material.color) o.material.color.multiply(new THREE.Color(1.7, 0.45, 0.45));
        if (o.material.emissive) {
          o.material.emissive = new THREE.Color(0xff3040);
          o.material.emissiveIntensity = 1.3;
        }
      }
    });
    g.scale.setScalar(1.3);
  }
  const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3;
  g.position.set(Math.cos(a) * r, Math.sin(a) * r, clearOfGates(zOverride ?? SPAWN_Z));
  world.add(g);
  hunters.push({ group: g, fireT: 1.2 + Math.random(), hp: elite ? 9 : 3, elite });
}
function spawnBullet(from) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), M.redSolid);
  m.position.copy(from);
  const dir = new THREE.Vector3(player.x - from.x, player.y - from.y, 0 - from.z).normalize();
  world.add(m);
  bullets.push({ mesh: m, vel: dir.multiplyScalar(46) });
  sfx.enemyFire();
}

// ---------------- deep-strata hostiles ----------------
// brief hitscan tracer between two points (feral-kodama suppression fire)
const beams = [];
function beam(a, b, color) {
  const l = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]),
    new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  l.userData.ownMat = true;
  scene.add(l);
  beams.push({ line: l, life: 0 });
}

// FERAL KODAMA (守衛機関列): a corrupted escort-mind that hunts your escorts,
// not you — one of your own, hacked and turned. Kill it to recover
// a downed escort instantly.
function spawnFeral() {
  const g = new THREE.Group();
  if (MODELS.escort) {
    const m = MODELS.escort.clone(true);
    m.traverse(o => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.userData.ownMat = true;
        if (o.material.color) o.material.color.multiply(new THREE.Color(1.5, 0.3, 0.3));
        if (o.material.emissive) {
          o.material.emissive = new THREE.Color(0xff3040);
          o.material.emissiveIntensity = 0.9;
        }
      }
    });
    g.add(m);
  } else {
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.5, 8, 6)), M.red));
  }
  const side = Math.random() < 0.5 ? -1 : 1;
  g.position.set(side * 7, 2 + Math.random() * 2, -240);
  scene.add(g);
  ferals.push({ group: g, side, t: 0, life: 0, fireT: 2.4, hp: 14 }); // survives the escorts' first burst exchange
  if (!fxMuted()) {
    announce('FERAL KODAMA', '狂イ木霊 随伴機ヲ狙ウ', true, 2200);
    chat('feral');
  }
}

// EMPTY VESSELS (器ノ鋳造所): hollow ceramic vessels adrift in the foundry.
// Ashen bone-fired clones of the diver herself — lane hazards that shatter.
// Craquelure + sparse gold seams keep them in the obsidian/kintsugi family
// (they used to be flat porcelain white and read as untextured placeholders).
let shellMat = null;
function makeShellMat() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#b4aa98'; // ashen bone
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) { // kiln mottle
    g.fillStyle = Math.random() < 0.5 ? 'rgba(116,106,90,0.05)' : 'rgba(226,218,200,0.05)';
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 9, 0, 6.283);
    g.fill();
  }
  const em = document.createElement('canvas'); // gold seams live on the emissive map
  em.width = em.height = 256;
  const ge = em.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 30; i++) { // craquelure random walks; ~1 in 4 is a gold seam
    const gold = Math.random() < 0.28;
    let x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * 6.283;
    g.strokeStyle = 'rgba(52,44,36,0.7)';
    g.lineWidth = gold ? 1.7 : 1.1;
    g.beginPath(); g.moveTo(x, y);
    if (gold) { ge.strokeStyle = 'rgba(255,178,64,0.95)'; ge.lineWidth = 1.7; ge.beginPath(); ge.moveTo(x, y); }
    const steps = 5 + Math.floor(Math.random() * 7);
    for (let s = 0; s < steps; s++) {
      a += (Math.random() - 0.5) * 1.4;
      x += Math.cos(a) * (8 + Math.random() * 16);
      y += Math.sin(a) * (8 + Math.random() * 16);
      g.lineTo(x, y);
      if (gold) ge.lineTo(x, y);
    }
    g.stroke();
    if (gold) ge.stroke();
  }
  const map = new THREE.CanvasTexture(cv);
  const emis = new THREE.CanvasTexture(em);
  return new THREE.MeshStandardMaterial({
    map, color: 0x9e9e9e, roughness: 0.6, metalness: 0.05, // tuned live vs the key light
    emissiveMap: emis, emissive: 0xffb040, emissiveIntensity: 1.4,
  });
}
function spawnShellCluster() {
  if (!MODELS.diver) return;
  if (!shellMat) shellMat = makeShellMat();
  const n = 3 + Math.floor(Math.random() * 3);
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < n && shells.length < 10; i++) {
    const m = stripOutline(cloneSkinned(MODELS.diver));
    m.traverse(o => { o.userData.sharedGeo = true; if (o.isMesh) o.material = shellMat; });
    const g = new THREE.Group();
    g.add(m);
    g.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    const ang = base + i * 1.1, r = 1.4 + Math.random() * 2.0;
    g.position.set(Math.cos(ang) * r, Math.sin(ang) * r, SPAWN_Z - i * 12);
    world.add(g);
    shells.push({ group: g, ang, r, spin: (Math.random() - 0.5) * 1.4, grazed: false });
  }
  chat('shell');
}
function shatterShell(s) {
  burst(s.group.position.clone(), 0xcfc4ae, 26, 8);
  sfx.kill();
  disposeGroup(s.group);
}

// GRAVEKEEPER (守衛機関): heavy warden construct. Slow, armored, twin chin
// gatlings. Cracking it always drops a power-up.
function spawnKeeper() {
  const g = new THREE.Group();
  if (MODELS.keeper) {
    g.add(MODELS.keeper.clone(true));
  } else {
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 1.2, 0.8)), M.dim);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), M.redSolid);
    eye.position.set(0.18, 0.25, 0.45);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), M.redSolid);
    eye2.position.set(-0.18, 0.25, 0.45);
    g.add(box, eye, eye2);
  }
  const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2;
  g.position.set(Math.cos(a) * r, Math.sin(a) * r, SPAWN_Z);
  world.add(g);
  keepers.push({ group: g, hp: 8, wob: Math.random() * 6.28 });
  if (!fxMuted()) {
    announce('GRAVEKEEPER', '墓守 接近', true, 2000);
    chat('keeper');
  }
}

// CHORISTER CONTACT (聖歌手ノ座): the endgame. She waits at layer 9;
// the merge — not a kill — completes the dive.
let goldMat = null;
function spawnChorister() {
  if (!goldMat) goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd88a, roughness: 0.25, metalness: 0.8,
    emissive: 0xffb020, emissiveIntensity: 1.4,
  });
  const g = new THREE.Group();
  if (MODELS.diver) {
    const m = stripOutline(cloneSkinned(MODELS.diver));
    m.traverse(o => { o.userData.sharedGeo = true; if (o.isMesh) o.material = goldMat; });
    g.add(m);
  } else {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.8), M.amberSolid));
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc860, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(7);
  halo.userData.ownMat = true;
  g.add(halo);
  g.position.set(0, 0, -260);
  scene.add(g);
  G.chor = { group: g, halo, t: 0, done: false, lineN: 0 };
  if (!fxMuted()) {
    announce('SHE IS WAITING', '聖歌手 降下セヨ', false, 3200);
    chat('chor');
  }
}
function merge() {
  const P = G.chor;
  if (!P || P.done || G.mode !== 'playing') return;
  P.done = true;
  const aliveT = kodamas.filter(t => t.alive).length;
  // the merge reads your trace: arrive quiet and she says so (and pays for it)
  const tier = G.traced > 0 ? 'traced' : (G.trace < 30 ? 'silent' : 'standard');
  // flat award, never through the chain multiplier: the merge is a fixed,
  // legible jackpot (scaled by loop depth), not a x8 chain payout that
  // dwarfs the whole run and contradicts the number on the win screen
  const bonus = Math.round((20000 + G.integrity * 2500 + aliveT * 3000) * (1 + 0.25 * (G.loop - 1)))
    + (tier === 'silent' ? 10000 : 0);
  G.score += bonus;
  G.banked = G.score; // the merge banks everything: this is the safe point
  feed(`MERGE +${bonus.toLocaleString()} // 融合`, 'amber');
  iceLine(MERGE_LINES[tier][0], true, '聖歌手');
  chat('merge');
  sfx.evaded();
  flash('breach', 0.55, 900);
  G.slowmo = 1.2;
  shockwave(player.x, player.y, COL.amber, 12);
  burst(new THREE.Vector3(player.x, player.y, -4), COL.amber, 90, 14);
  disposeGroup(P.group);
  G.chor = null;
  if (G.auto) { G.chorRedive = 1.6; return; } // attract mode just re-dives
  G.mode = 'won';
  G.trigger = false;
  G.tuck = false;
  effFloor = 0; // a completed dive resets the warm-start
  // winning must persist at least as well as dying does
  const isBest = !G.training && G.score > G.best;
  if (isBest) { G.best = G.score; localStorage.setItem('ab_best', G.best); }
  setTimeout(() => {
    const tierLine = tier === 'silent'
      ? `SILENT HARMONY // 静寂ノ融和 (+10,000)<br>`
      : (tier === 'traced' ? `MERGED MID-FIREFIGHT // 交戦融合<br>` : '');
    $('winStats').innerHTML =
      `SCORE <b>${G.score.toLocaleString()}</b>${isBest ? ' // NEW BEST' : ''}<br>` +
      `DIVE ${String(G.loop).padStart(2, '0')} COMPLETE // MERGE BONUS ${bonus.toLocaleString()}<br>` +
      tierLine +
      `INTEGRITY ${G.integrity}/4 // KODAMA ${aliveT}/2 // CHAIN x${mult()}<br>` +
      `<span style="color:var(--dim)">"${MERGE_LINES[tier][0][0]}"</span>`;
    renderScores($('scoresWin'), loadScores());
    $('win').classList.remove('hidden');
    document.body.className = 'won';
    playTrack('title', true);
  }, 1400);
}
function diveDeeper() {
  const score = G.score, loop = G.loop, hits = G.hits, training = G.training, banked = G.banked;
  $('win').classList.add('hidden');
  resetRun(false, INTRO_REDIVE);
  G.score = score;
  G.loop = loop + 1;
  G.hits = hits;
  G.training = training; // a training run stays a training run across loops
  G.banked = banked;     // the gamble: everything above this is riding
  ui.layerName.textContent = `DIVE ${String(G.loop).padStart(2, '0')} // ` + layerName(0)[0];
  feed(`DIVE ${String(G.loop).padStart(2, '0')} // 再降下`, 'amber');
}
function endRunFromWin() {
  $('win').classList.add('hidden');
  if (!G.training) {
    saveScore(G.score, Math.round(G.dist), (G.loop - 1) * 9 + G.layer + 1);
    if (G.score > G.best) { G.best = G.score; localStorage.setItem('ab_best', G.best); }
  }
  toTitle();
}

// the player's gun fires down the flight line: steering IS aiming.
// only hostiles inside a modest forward cone are engageable by a tap.
function coneHostile(x, y, halfAngle = 0.24, maxR = 320) {
  let best = null, bd = maxR;
  for (const list of [hunters, mines, ferals, keepers, shells]) {
    for (const h of list) {
      const p = h.group.position;
      if (p.z > -4) continue;
      const lat = Math.hypot(p.x - x, p.y - y);
      if (Math.atan2(lat, -p.z) > halfAngle) continue;
      const d = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2 + p.z * p.z);
      if (d < bd) { bd = d; best = h; }
    }
  }
  return best;
}
function closestHostile(x, y, z = 0, maxR = 300) {
  let best = null, bd = maxR;
  for (const list of [hunters, mines, ferals, keepers, shells]) {
    for (const h of list) {
      const p = h.group.position;
      if (p.z > -4) continue;
      const d = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2);
      if (d < bd) { bd = d; best = h; }
    }
  }
  return best;
}
// arcade tracer bolts: additive glowing rounds that bloom
const boltGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.35, 6);
boltGeo.rotateX(Math.PI / 2);
M.boltBlue = new THREE.MeshBasicMaterial({
  color: new THREE.Color(COL.blue).multiplyScalar(2.6),
  transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
});
M.boltAmber = new THREE.MeshBasicMaterial({
  color: new THREE.Color(COL.amber).multiplyScalar(2.6),
  transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
});
M.headBlue = new THREE.SpriteMaterial({
  map: glowTex, color: COL.blue, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
M.headAmber = new THREE.SpriteMaterial({
  map: glowTex, color: COL.amber, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const muzzles = [];
function muzzleFlash(x, y, z, color, size = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.userData.ownMat = true;
  s.scale.setScalar(size);
  s.position.set(x, y, z);
  world.add(s);
  muzzles.push({ sprite: s, age: 0, life: 0.09 });
}
const _muzzleV = new THREE.Vector3();
const _eyeHot = new THREE.Color(COL.blue); // escort eyes flare to tracer blue under fire
function kodamaMuzzle(t) {
  const off = MODEL_TUNE.escort.muzzle;
  if (off && MODELS.escort) {
    _muzzleV.set(...off);
    return t.group.localToWorld(_muzzleV);
  }
  return _muzzleV.copy(t.group.position);
}
function fireSpike(fromX, fromY, isKodama = false, target = null, spread = 0, quiet = false, fromZ = -1, shooterVX = 0, shooterVY = 0) {
  const mesh = new THREE.Mesh(boltGeo, isKodama ? M.boltBlue : M.boltAmber);
  mesh.userData.sharedGeo = true; // boltGeo is shared by every round in flight
  mesh.position.set(fromX, fromY, fromZ);
  const head = new THREE.Sprite(isKodama ? M.headBlue : M.headAmber);
  head.scale.setScalar(0.42);
  head.position.z = -0.7;
  mesh.add(head);
  const vel = new THREE.Vector3(0, 0, -310);
  if (target) {
    const tp = target.group.position;
    const eta = Math.abs(tp.z - fromZ) / 310;
    vel.set(tp.x - fromX, tp.y - fromY, tp.z + G.speed * eta * 0.6 - fromZ).normalize().multiplyScalar(310);
  }
  if (spread) {
    vel.x += (Math.random() - 0.5) * spread * 310;
    vel.y += (Math.random() - 0.5) * spread * 310;
    vel.normalize().multiplyScalar(310);
  }
  // inherit the shooter's lateral momentum: streams whip as you maneuver
  vel.x += THREE.MathUtils.clamp(shooterVX, -40, 40) * 0.85;
  vel.y += THREE.MathUtils.clamp(shooterVY, -40, 40) * 0.85;
  mesh.lookAt(fromX + vel.x, fromY + vel.y, fromZ + vel.z);
  world.add(mesh);
  spikes.push({ mesh, isKodama, vel, target, power: isKodama ? 1 : 3, life: 0 });
  muzzleFlash(fromX, fromY, fromZ + 0.4, isKodama ? COL.blue : COL.amber,
    isKodama ? 0.9 : (quiet ? 1.0 : 1.7)); // the player's opening round flashes big
  if (!quiet) (isKodama ? sfx.kodamaFire : sfx.fire)();
  else sfx.chainTick();
}

// ---------------- gate shatter (reference: barrier discs breaking apart) ----------------
const shatters = [];
function shatterGate(g) {
  const parts = [];
  for (const c of g.group.children) {
    if (c.userData.midAngle === undefined) { c.visible = false; continue; }
    if (c.userData.panelEdge) {
      c.material = c.material.clone(); // shared edge material: clone before fading
      c.userData.ownMat = true;
    }
    const a = c.userData.midAngle + g.group.rotation.z;
    parts.push({
      obj: c,
      vx: Math.cos(a) * (2.5 + Math.random() * 4),
      vy: Math.sin(a) * (2.5 + Math.random() * 4),
      vz: 4 + Math.random() * 10,
      spin: (Math.random() - 0.5) * 7,
      baseOp: c.material.opacity,
    });
  }
  shatters.push({ group: g.group, parts, age: 0, life: 0.85 });
}

// ---------------- shockwaves ----------------
const waves = [];
const hexUnit = new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 7 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    return new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
  })
);
function shockwave(x, y, color = COL.ink, size = 5) {
  const line = new THREE.Line(hexUnit,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  line.position.set(x, y, 0.2);
  scene.add(line);
  waves.push({ line, age: 0, life: 0.5, size });
}

// ---------------- power-ups ----------------
const pickups = [];
const PICKUP_DEFS = {
  bt:      { color: COL.blue,  label: 'BULLET TIME', jp: '弾丸時間' },
  breaker: { color: COL.red,   label: 'BREAKER',     jp: '強行突破' },
  line:    { color: 0x9ff2ff,  label: 'FLYLINE',     jp: '航路表示' },
  data:    { color: COL.amber, label: 'MEMORY FILE', jp: '記憶素子' }, // vault layer only
};
function spawnPickup(kind, at) {
  const def = PICKUP_DEFS[kind];
  const g = new THREE.Group();
  const ring = new THREE.Line(hexUnit, new THREE.LineBasicMaterial({
    color: def.color, transparent: true, opacity: 0.9,
  }));
  ring.scale.setScalar(0.75);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(2.2) }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: def.color, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(2.2);
  const tag = labelSprite(def.label, '#' + new THREE.Color(def.color).getHexString(), 0.85);
  tag.position.y = -0.95;
  ring.userData.ownMat = true;
  core.userData.ownMat = true;
  halo.userData.ownMat = true;
  g.add(ring, core, halo, tag);
  const a = Math.random() * Math.PI * 2, r = Math.random() * 3.4;
  g.position.set(Math.cos(a) * r, Math.sin(a) * r, SPAWN_Z);
  if (at) g.position.set(at.x, at.y, Math.min(at.z, -30)); // e.g. dropped by a cracked GRAVEKEEPER
  world.add(g);
  pickups.push({ group: g, kind, spin: 1 + Math.random() });
}
function awardPickup(kind) {
  const def = PICKUP_DEFS[kind];
  if (kind === 'bt') G.bt = Math.min(8, G.bt + 4);
  if (kind === 'breaker') G.breaker = Math.min(3, G.breaker + 1);
  if (kind === 'line') G.flyline = 14;
  if (kind === 'data') {
    // stealing is the point of a heist — and theft is loud
    addScore(600, 'MEMORY THEFT // 記憶窃取', 'amber');
    G.trace = Math.min(100, G.trace + 8);
    traceTick('+TRACE');
  }
  feed(`${def.label} // ${def.jp}`, kind === 'breaker' ? 'red' : 'blue');
  announce(def.label, def.jp, false, 1300);
  sfx.pickup();
  flash('breach', 0.15, 150);
  // the award lands ON you, in the power-up's color
  shockwave(player.x, player.y, def.color, 7.5);
  burst(new THREE.Vector3(player.x, player.y, 0), def.color, 24, 7);
}
function toggleBulletTime() {
  if (G.mode !== 'playing' || G.auto || G.intro > 0 || G.paused) return;
  if (!G.btOn && G.bt <= 0.1) { tone(180, 0.06, 'square', 0.08); return; }
  G.btOn = !G.btOn;
  document.body.classList.toggle('bullettime', G.btOn);
  sfx.btToggle(G.btOn);
  // chrono ripple: the world visibly snaps into / out of dilation
  shockwave(player.x, player.y, COL.blue, G.btOn ? 9 : 4.5);
  if (G.btOn) {
    traceTick('+TRACE'); // dilation spends stealth: say so at the meter
    flash('breach', 0.14, 280);
    burst(new THREE.Vector3(player.x, player.y, 0), COL.blue, 18, 6);
  }
}

// flyline: the racing line through the next gaps
const flylineGeo = new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 16 }, () => new THREE.Vector3()));
const flylineMesh = new THREE.Line(flylineGeo, new THREE.LineBasicMaterial({
  color: new THREE.Color(0x9ff2ff).multiplyScalar(2.4), // HDR: bloom lifts the line
  transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
flylineMesh.visible = false;
scene.add(flylineMesh);
// marching beacons: glow dots that flow along the route toward the next gap
const flyBeacons = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(0x9ff2ff).multiplyScalar(2.2),
    transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.visible = false;
  scene.add(s);
  flyBeacons.push(s);
}
function updateFlyline() {
  if (G.flyline <= 0 || G.mode !== 'playing') {
    flylineMesh.visible = false;
    for (const b of flyBeacons) b.visible = false;
    return;
  }
  flylineMesh.visible = true;
  const gates2 = gates.filter(g => !g.passed && g.group.position.z < -2)
    .sort((a, b) => b.group.position.z - a.group.position.z)
    .slice(0, 3);
  const wp = [new THREE.Vector3(player.x, player.y, 0)];
  for (const g of gates2) {
    const z = g.group.position.z;
    const gap = g.gaps[0];
    const a = gap.center + g.group.rotation.z + g.rotSpeed * (-z / Math.max(G.speed, 1));
    wp.push(new THREE.Vector3(Math.cos(a) * 2.6, Math.sin(a) * 2.6, z));
  }
  if (wp.length === 1) wp.push(new THREE.Vector3(player.x, player.y, -300));
  // sample a smooth curve through the waypoints
  const curve = new THREE.CatmullRomCurve3(wp);
  const pos = flylineGeo.attributes.position;
  for (let i = 0; i < 16; i++) {
    const p = curve.getPoint(i / 15);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  flylineMesh.material.opacity = 0.6 + Math.sin(G.time * 5) * 0.2;
  const tphase = (G.time * 0.55) % 1;
  for (let i = 0; i < flyBeacons.length; i++) {
    const b = flyBeacons[i];
    const u = 0.12 + 0.88 * ((i + tphase) / flyBeacons.length); // start ahead of the diver
    b.position.copy(curve.getPoint(u));
    b.scale.setScalar(0.55 + 0.2 * Math.sin(G.time * 6 + i * 1.7));
    b.material.opacity = 0.75 * (1 - u * 0.45);
    b.visible = true;
  }
}

// ---------------- particles ----------------
function burst(pos, color, n = 26, speed = 9) {
  const positions = new Float32Array(n * 3);
  const vels = [];
  for (let i = 0; i < n; i++) {
    positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize().multiplyScalar(speed * (0.4 + Math.random()));
    vels.push(v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color, size: 0.26, transparent: true, opacity: 1,
    map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  world.add(p);
  bursts.push({ points: p, vels, life: 0.7, age: 0 });
}

// ---------------- scoring / damage ----------------
function addScore(base, label, cls) {
  const pts = Math.round(base * mult());
  G.score += pts;
  if (label) feed(`+${pts} ${label}`, cls);
}
function damage(srcPos, cause = 'SYSTEM SHOCK // 障害') {
  if (G.invuln > 0 || G.mode !== 'playing') return;
  // a living kodama intercepts the hit
  const saver = kodamas.find(t => t.alive);
  if (saver) return kodamaSave(saver, srcPos);
  G.lastHit = cause; // so the death screen can say WHY
  G.integrity--;
  G.hits++;
  if (G.chain >= 4) feed('CHAIN BROKEN // 連鎖消失', 'red'); // losing the mult must sting visibly
  G.chain = 0;
  G.trace = Math.min(100, G.trace + 14);
  G.invuln = 1.3;
  G.shake = Math.max(G.shake, 0.9);
  flash('hit', 0.45, 220);
  sfx.hit();
  document.body.classList.add('glitch');
  setTimeout(() => document.body.classList.remove('glitch'), 350);
  burst(new THREE.Vector3(player.x, player.y, 0), COL.red, 40, 12);
  shockwave(player.x, player.y, COL.red, 6);
  feed('DIVE DAMAGE // 損傷', 'red');
  if (G.training && G.integrity <= 0) {
    G.integrity = 4;
    feed('TRAINING // INTEGRITY RESTORED 再構成', 'blue');
  }
  document.body.classList.toggle('critical', G.integrity === 1);
  if (G.integrity <= 0) gameOver();
}
function kodamaSave(t, srcPos) {
  t.alive = false;
  t.respawn = 13; // recovery was doubly nerfed (re-arm deleted); soften the timer
  G.invuln = 1.0;
  G.chain = Math.max(0, G.chain - 2);
  G.trace = Math.min(100, G.trace + 7);
  G.shake = Math.max(G.shake, 0.5);
  sfx.save();
  setTimeout(() => sfx.tachDown(), 300);
  // make the save LEGIBLE: the escort lunges to the impact point, and the
  // player is told exactly what protection remains
  const impact = srcPos && srcPos.isVector3 ? srcPos : null; // AB.damage may pass plain objects
  if (impact) beam(t.group.position, impact, COL.blue);
  burst((impact ? impact.clone() : t.group.position.clone()).setZ(0), COL.blue, 36, 10);
  const left = kodamas.filter(x => x.alive).length;
  if (!fxMuted()) announce(`KODAMA INTERCEPT // ${left} SAVE${left === 1 ? '' : 'S'} LEFT`,
    `随伴機ガ庇ッタ 残${left}`, false, 1700);
  feed('KODAMA INTERCEPT', 'blue');
  chat('save');
  setTimeout(() => chat('down'), 1200);
}
function gameOver() {
  // attract just re-dives — but DEFERRED to the next frame: resetting here
  // empties the entity arrays while step() is still iterating them
  if (G.auto && !G.demoFX) { G.autoRedive = true; return; }
  G.mode = 'dead';
  G.deadT = 0;
  // warm start only from REAL deaths: training and demo deaths must not
  // contaminate the next real run's difficulty
  if (!G.auto && !G.training) effFloor = Math.max(0, Math.min(3, G.layer - 2));
  if (!G.auto) playTrack('gameover');
  sfx.dead();
  flash('hit', 0.7, 500);
  G.shake = 2;
  burst(new THREE.Vector3(player.x, player.y, 0), COL.red, 80, 16);
  player.group.visible = false;
  // the DIVE DEEPER gamble: dying in a later loop banks only what the last
  // merge locked in. Loop 1 has no merge yet, so it banks the full run.
  const saved = G.loop > 1 ? G.banked : G.score;
  const lost = G.score - saved;
  const isBest = !G.auto && !G.training && saved > G.best;
  if (isBest) { G.best = saved; localStorage.setItem('ab_best', G.best); }
  if (!G.auto && !G.training) {
    const { top, ts } = saveScore(saved, Math.round(G.dist), (G.loop - 1) * 9 + G.layer + 1);
    renderScores(ui.scoresOver, top, ts);
  } else if (G.training) {
    renderScores(ui.scoresOver, loadScores());
  }
  const nearMiss = !isBest && G.best > 0 && !G.auto ? ` // BEST -${Math.max(0, G.best - saved).toLocaleString()}` : '';
  ui.overStats.innerHTML =
    `SCORE <b>${saved.toLocaleString()}</b>${isBest ? ' // NEW BEST' : nearMiss}<br>` +
    (lost > 0 ? `<span style="color:var(--red)">UNMERGED ${lost.toLocaleString()} LOST // 未融合分消失</span><br>` : '') +
    `BURNED BY ${G.lastHit || 'THE BARRIER'} // LAYER ${(G.loop - 1) * 9 + G.layer + 1}<br>` +
    (G.loop === 1 && !G.chor ? `SUBSTRATE ${Math.max(0, LAYER_LEN * 9 - Math.round(G.dist)).toLocaleString()}m BELOW // 目標未達<br>` : '') +
    `BEST ${G.best.toLocaleString()}`;
  document.body.className = 'dead';
  setTimeout(() => ui.over.classList.remove('hidden'), 900);
}

// ---------------- run control ----------------
function resetRun(auto, introLen = INTRO_LEN) {
  for (const arr of [gates, mines, hunters, bullets, spikes, ferals, shells, keepers, limpets]) {
    for (const e of arr) disposeGroup(e.group || e.mesh);
    arr.length = 0;
  }
  for (const b2 of beams) disposeGroup(b2.line);
  beams.length = 0;
  if (G.chor) { disposeGroup(G.chor.group); G.chor = null; }
  $('win').classList.add('hidden');
  for (const b of bursts) disposeGroup(b.points);
  bursts.length = 0;
  for (const s of shatters) disposeGroup(s.group);
  shatters.length = 0;
  for (const m2 of muzzles) disposeGroup(m2.sprite);
  muzzles.length = 0;
  for (const t of kodamas) { t.burst = 0; t.roundT = 0; t.fireT = 1 + Math.random(); }
  Object.assign(G, {
    mode: 'playing', auto, demoFX: false,
    time: 0, dist: 0, speed: 46, layer: 0,
    score: 0, chain: 0, hits: 0,
    integrity: 4, energy: 3, energyT: 0,
    trace: 0, traced: 0, tracedSurvive: 0,
    invuln: 0, slowmo: 0, shake: 0, fovKick: 0,
    nextGate: 90, nextMine: 55, nextHunter: 260,
    alarmT: 0, intro: auto ? 0 : introLen, introLen, introFired: false, introFx: false, introE: 0,
    traceWarned: false, lastHit: '', autoRedive: false,
    ice50: false, iceSilent: false, iceDeep: false, hotCount: 0,
    layerFired: false, eliteSeen: false,
    trigger: false, tuck: false, tuckK: 0, paused: false, training: false,
    bt: auto ? 0 : 2.5, btOn: false, breaker: 0, flyline: 0, nextPickup: 300,
    loop: 1, banked: 0, chor: null, chorRedive: 0, lastEngaged: null,
    nextShell: 400, nextFeral: 600, nextKeeper: 700, nextLimpet: 650, limpet: false,
    nextVault: 0, blackK: 0,
  });
  document.body.classList.remove('bullettime');
  setLimpetFx(false);
  for (const p of pickups) disposeGroup(p.group);
  pickups.length = 0;
  flylineMesh.visible = false;
  document.body.classList.remove('paused');
  ui.pause.classList.add('hidden');
  ui.layerName.textContent = layerName(0)[0];
  player.x = player.y = player.tx = player.ty = 0;
  player.group.visible = true;
  player.group.scale.setScalar(G.intro > 0 ? 0.001 : 1);
  for (const t of kodamas) {
    t.group.position.set(t.side * 9, 3.5, -14);
    if (G.intro > 0) t.group.visible = false;
  }
  if (G.intro > 0) document.body.classList.add('intro');
  // prewarm the track so the dive has content from the first seconds
  for (const z of [-200, -300, -400]) {
    spawnGate();
    gates[gates.length - 1].group.position.z = z;
  }
  // keep escorts hidden during the intro so their staggered materialize
  // bursts (intro step effect) actually play
  for (const t of kodamas) { t.alive = true; t.respawn = 0; t.group.visible = G.intro <= 0; }
  ui.chatter.innerHTML = '';
  document.body.classList.remove('traced', 'critical');
  if (!auto) {
    document.body.className = 'playing intro';
    ui.title.classList.add('hidden');
    ui.over.classList.add('hidden');
    playTrack('dive', true);
  }
}
function toTitle() {
  playTrack('title');
  ui.best.textContent = G.best ? `BEST DIVE // ${G.best.toLocaleString()}` : '';
  ui.title.classList.remove('hidden');
  ui.over.classList.add('hidden');
  document.body.className = 'title';
  resetRun(true);
  G.mode = 'playing'; // attract sim runs under the title screen
}

// ---------------- input ----------------
// touch-primary devices: the dive is tuned for mouse precision, so phones get
// the attract sim as a living poster instead of a degraded port
const TOUCH_ONLY = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
if (TOUCH_ONLY) {
  document.body.classList.add('touchview');
  const p = document.querySelector('#title .prompt');
  if (p) p.textContent = 'PLAY ON DESKTOP // デスクトップ専用';
}
addEventListener('mousemove', e => {
  if (G.freelook && orbit.dragging) {
    orbit.yaw -= (e.clientX - orbit.lx) * 0.008;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - orbit.ly) * 0.006, -1.2, 1.35);
    orbit.lx = e.clientX;
    orbit.ly = e.clientY;
    return;
  }
  if (G.auto || G.paused) return;
  const nx = (e.clientX / innerWidth) * 2 - 1;
  const ny = -((e.clientY / innerHeight) * 2 - 1);
  player.tx = nx * PLAY_R * 1.15;
  player.ty = ny * PLAY_R * 1.15;
});
addEventListener('mousedown', e => {
  if (G.freelook && e.button === 0) {
    orbit.dragging = true;
    orbit.lx = e.clientX;
    orbit.ly = e.clientY;
    return;
  }
  if (TOUCH_ONLY) return; // poster mode: taps never start a dive
  if (e.button !== 0 || G.paused) return;
  if (e.target.closest('button, input, #settings')) return; // menu clicks never start a dive
  audioInit();
  musicInit();
  AU.ctx && AU.ctx.resume();
  applyVolumes();
  if (!$('settings').classList.contains('hidden')) return;
  if (!ui.title.classList.contains('hidden')) return resetRun(false);
  if (G.mode === 'dead') { if (G.deadT > 1.0) toTitleOrRestart(); return; } // after the 0.9s reveal
  // any input during the intro skips to the dive
  if (G.mode === 'playing' && !G.auto && G.intro > 0.25) G.intro = 0.25;
});
function toTitleOrRestart() { resetRun(false, INTRO_REDIVE); }
addEventListener('mouseup', () => { orbit.dragging = false; });
// ---------------- bindable controls ----------------
const DEFAULT_CONTROLS = { fire: 'KeyF', tuck: 'ShiftLeft', bt: 'Space', pause: 'Escape', mute: 'KeyM' };
const CONTROLS = (() => {
  try { return { ...DEFAULT_CONTROLS, ...JSON.parse(localStorage.getItem('ab_controls') || '{}') }; }
  catch { return { ...DEFAULT_CONTROLS }; }
})();
const CONTROL_LABELS = { fire: 'FIRE', tuck: 'TUCK', bt: 'BULLET TIME', pause: 'PAUSE', mute: 'MUTE' };
let rebinding = null;
function keyLabel(code) {
  return code.replace(/^Key|^Digit/, '').replace('Arrow', '').replace('Escape', 'ESC')
    .replace('ShiftLeft', 'SHIFT').replace('ShiftRight', 'R-SHIFT')
    .replace('ControlLeft', 'CTRL').replace('ControlRight', 'R-CTRL').toUpperCase();
}
function renderControls() {
  const el = $('ctrlRows');
  el.innerHTML = Object.keys(CONTROLS).map(k =>
    `<div class="ctrlRow"><span>${CONTROL_LABELS[k]}</span>` +
    `<button data-bind="${k}" class="${rebinding === k ? 'binding' : ''}">` +
    `${rebinding === k ? 'PRESS KEY…' : keyLabel(CONTROLS[k])}</button></div>`).join('');
  el.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { rebinding = b.dataset.bind; renderControls(); }));
  const hint = document.querySelector('#title .controls');
  if (hint) hint.innerHTML =
    `MOUSE — STEER // ${keyLabel(CONTROLS.fire)} — FIRE (HOLD FOR CHAIN GUNS)<br>` +
    `${keyLabel(CONTROLS.tuck)} — TUCK (FAST + LOUD, GATE SCORE x1.5, NO GUNS)<br>` +
    `${keyLabel(CONTROLS.bt)} — BULLET TIME // ${keyLabel(CONTROLS.pause)} — PAUSE // ${keyLabel(CONTROLS.mute)} — MUTE<br>` +
    `AMBER HOT LANES VENT TRACE // GRAZE FOR BONUS`;
  const bk = $('btKeyHint');
  if (bk) bk.textContent = `[${keyLabel(CONTROLS.bt)} / 右クリック]`;
}
renderControls();

// ---------------- settings (difficulty + volumes) ----------------
const DIFFS = {
  calm:     { spd: 5, cad: 1.3,  trace: 0.7 },   // gentler speed ramp, sparser spawns, slow trace
  standard: { spd: 7, cad: 1.0,  trace: 1.0 },   // the tuning everything was balanced at
  lethal:   { spd: 9, cad: 0.78, trace: 1.4 },
};
const DEFAULT_SETTINGS = { difficulty: 'standard', sfx: 45, drone: 45, music: 100 };
const SETTINGS = (() => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ab_settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
})();
if (!DIFFS[SETTINGS.difficulty]) SETTINGS.difficulty = 'standard';
const DIFF = () => DIFFS[SETTINGS.difficulty];
function saveSettings() { localStorage.setItem('ab_settings', JSON.stringify(SETTINGS)); }
function applyVolumes() {
  if (AU.master) AU.master.gain.value = MUSIC.enabled ? SETTINGS.sfx / 100 : 0;
  if (AU.ambient) AU.ambient.gain.value = MUSIC.enabled ? SETTINGS.drone / 100 : 0;
  try {
    const g = MUSIC.mod?.getSuperdoughAudioController?.()?.output?.destinationGain;
    // free look ducks the score: background lounge, not a concert
    if (g) g.gain.value = (SETTINGS.music / 100) * (G.freelook ? 0.35 : 1);
  } catch { /* strudel not up yet; applied again once it is */ }
}
let settingsFrom = null;
function openSettings(from) {
  settingsFrom = from;
  $('settings').classList.remove('hidden');
  if (from === 'title') ui.title.classList.add('hidden');
  if (from === 'pause') ui.pause.classList.add('hidden');
  renderSettings();
}
function closeSettings() {
  if ($('settings').classList.contains('hidden')) return false;
  $('settings').classList.add('hidden');
  if (settingsFrom === 'title') ui.title.classList.remove('hidden');
  if (settingsFrom === 'pause' && G.paused) ui.pause.classList.remove('hidden');
  settingsFrom = null;
  return true;
}
function renderSettings() {
  $('diffRow').querySelectorAll('button').forEach(b =>
    b.classList.toggle('sel', b.dataset.diff === SETTINGS.difficulty));
  $('sfxVol').value = SETTINGS.sfx;
  $('sfxVolVal').textContent = SETTINGS.sfx + '%';
  $('droneVol').value = SETTINGS.drone;
  $('droneVolVal').textContent = SETTINGS.drone + '%';
  $('musVol').value = SETTINGS.music;
  $('musVolVal').textContent = SETTINGS.music + '%';
}
$('diffRow').addEventListener('click', e => {
  const d = e.target.dataset && e.target.dataset.diff;
  if (!d) return;
  SETTINGS.difficulty = d;
  saveSettings(); renderSettings();
  audioInit(); sfx.uiTick();
});
$('sfxVol').addEventListener('input', e => {
  SETTINGS.sfx = +e.target.value;
  saveSettings(); renderSettings();
  audioInit(); applyVolumes();
  sfx.graze(); // reference blip at the new level
});
$('droneVol').addEventListener('input', e => {
  SETTINGS.drone = +e.target.value;
  saveSettings(); renderSettings();
  audioInit(); applyVolumes();
});
$('musVol').addEventListener('input', e => {
  SETTINGS.music = +e.target.value;
  saveSettings(); renderSettings(); applyVolumes();
});
$('btnSettings').addEventListener('click', () => { audioInit(); applyVolumes(); openSettings('title'); });
$('btnSettingsP').addEventListener('click', () => openSettings('pause'));
$('btnSettingsBack').addEventListener('click', closeSettings);

// ---------------- training (power-up demos) ----------------
const TRAIN = { steps: [], step: 0, t: 0, announceT: 0, brk: 0 };
function buildTrainSteps() {
  return [
    { en: `BULLET TIME — PRESS ${keyLabel(CONTROLS.bt)}`, jp: '弾丸時間 起動セヨ',
      done: () => G.btOn },
    { en: `WORLD AT 35% — ${keyLabel(CONTROLS.bt)} AGAIN TO RELEASE`, jp: '弾丸時間 解除セヨ',
      done: () => !G.btOn },
    { en: 'BREAKER ARMED — FLY STRAIGHT INTO A WALL', jp: '防壁破砕 障壁ヘ突入セヨ',
      enter: () => { G.breaker = Math.max(G.breaker, 1); TRAIN.brk = G.breaker; },
      done: () => G.breaker < TRAIN.brk },
    { en: 'FLYLINE — FOLLOW THE CYAN ROUTE', jp: '航路表示 追従セヨ',
      enter: () => { G.flyline = 12; },
      done: () => TRAIN.t > 11 },
    { en: `TUCK — HOLD ${keyLabel(CONTROLS.tuck)} (FAST, LOUD, NO GUNS)`, jp: '急降下姿勢 維持セヨ',
      done: () => G.tuckK > 0.9 },
    { en: 'FLARE — RELEASE TO FLY LOOSE AGAIN', jp: '姿勢解除',
      done: () => !G.tuck && G.tuckK < 0.1 },
    { en: `TRACE LIMPET LATCHED — ${keyLabel(CONTROLS.fire)} TO PURGE`, jp: '寄生体 発砲デ除去セヨ',
      enter: () => { G.limpet = true; setLimpetFx(true); },
      done: () => !G.limpet },
    { en: 'FREE DIVE — ALL SYSTEMS YOURS', jp: '自由降下', quiet: true,
      enter: () => { G.bt = 8; G.breaker = 3; },
      done: () => false },
  ];
}
function startTraining() {
  closeSettings();
  resetRun(false, INTRO_REDIVE); // classroom, not ceremony
  G.training = true;
  G.bt = 8;
  G.breaker = 3;
  G.nextPickup = 220;
  TRAIN.steps = buildTrainSteps();
  TRAIN.step = 0; TRAIN.t = 0; TRAIN.announceT = 0.6;
  feed('TRAINING DIVE // 訓練降下', 'blue');
}
function trainTick(dt) {
  TRAIN.t += dt;
  const s = TRAIN.steps[TRAIN.step];
  if (!s) return;
  if (s.done()) {
    sfx.pickup();
    feed('COMPLETE // 完了', 'blue');
    TRAIN.step++; TRAIN.t = 0;
    const n = TRAIN.steps[TRAIN.step];
    if (n) { if (n.enter) n.enter(); announce(n.en, n.jp, false, 2600); TRAIN.announceT = 4; }
  } else if (!s.quiet) {
    TRAIN.announceT -= dt;
    if (TRAIN.announceT <= 0) { announce(s.en, s.jp, false, 2400); TRAIN.announceT = 3.6; }
  }
}
$('btnTraining').addEventListener('click', () => {
  audioInit(); musicInit();
  if (AU.ctx) AU.ctx.resume();
  applyVolumes();
  startTraining();
});

addEventListener('keydown', e => {
  if (rebinding) {
    e.preventDefault();
    if (e.code !== 'Escape') {
      // a key can only mean one thing: steal it from any other action.
      // if the displaced action's DEFAULT is the stolen key, swap instead
      // (otherwise both actions end up on the same key)
      const old = CONTROLS[rebinding];
      for (const k of Object.keys(CONTROLS))
        if (k !== rebinding && CONTROLS[k] === e.code)
          CONTROLS[k] = DEFAULT_CONTROLS[k] === e.code ? old : DEFAULT_CONTROLS[k];
      CONTROLS[rebinding] = e.code;
    }
    rebinding = null;
    localStorage.setItem('ab_controls', JSON.stringify(CONTROLS));
    renderControls();
    return;
  }
  // dead screen: fire/bt keys restart, same as a click. Requires a FRESH
  // press (no OS auto-repeat from a key held through death) and waits for
  // the over-screen reveal at 0.9s so the death is always readable
  if (G.mode === 'dead' && G.deadT > 1.0 && !e.repeat && (e.code === CONTROLS.fire || e.code === CONTROLS.bt)) {
    e.preventDefault();
    toTitleOrRestart();
    return;
  }
  // any key skips the intro — except the meta keys (pause and mute must
  // not burn the ceremony for someone answering the door)
  if (G.mode === 'playing' && !G.auto && !G.paused && G.intro > 0.25 &&
      e.code !== CONTROLS.pause && e.code !== CONTROLS.mute) G.intro = 0.25;
  switch (e.code) {
    case CONTROLS.pause:
      e.preventDefault();
      if (closeSettings()) break;
      if (G.freelook) exitFreelook();
      else setPaused(!G.paused);
      break;
    case CONTROLS.bt:
      e.preventDefault();
      toggleBulletTime();
      break;
    case CONTROLS.mute:
      setMuted(MUSIC.enabled);
      break;
    case CONTROLS.fire:
      e.preventDefault();
      if (G.mode === 'playing' && !G.auto && G.intro <= 0 && !G.paused) {
        if (!e.repeat) playerFire();
        // tucked, the trigger never latches: no phantom trace tax and no
        // silently-denied SILENT VERSE from guns that fired nothing
        if (!G.tuck) G.trigger = true;
      }
      break;
    case CONTROLS.tuck:
      e.preventDefault();
      // one hand-state at a time: tucking stows the guns
      if (G.mode === 'playing' && !G.auto && G.intro <= 0 && !G.paused) {
        G.tuck = true;
        G.trigger = false;
      }
      break;
  }
});
addEventListener('keyup', e => {
  if (e.code === CONTROLS.fire) G.trigger = false;
  if (e.code === CONTROLS.tuck) G.tuck = false; // flare
});
addEventListener('mousedown', e => { if (e.button === 2) toggleBulletTime(); });

// ---------------- free look (photo mode while paused) ----------------
const orbit = { yaw: 0.7, pitch: 0.28, r: 5, dragging: false, lx: 0, ly: 0 };
function enterFreelook() {
  if (!G.paused) return;
  G.freelook = true;
  ui.pause.classList.add('hidden');
  document.body.classList.add('freelook');
  // strip the glow so the models themselves are visible
  player.aura.visible = false;
  player.trail.visible = false;
  for (const w of player.wake) w.visible = false;
  applyVolumes(); // ducked score for photo mode
  if (MUSIC.enabled) playTrack('freelook', true);
}
function exitFreelook() {
  G.freelook = false;
  orbit.dragging = false;
  document.body.classList.remove('freelook');
  player.aura.visible = true;
  applyVolumes(); // restore full score level
  if (G.paused) { stopMusic(); ui.pause.classList.remove('hidden'); }
}
$('btnLook').addEventListener('click', enterFreelook);
addEventListener('wheel', e => {
  if (G.freelook) orbit.r = THREE.MathUtils.clamp(orbit.r + e.deltaY * 0.01, 2.2, 14);
}, { passive: true });
$('btnResume').addEventListener('click', () => setPaused(false));
$('btnDeeper').addEventListener('click', diveDeeper);
$('btnEndRun').addEventListener('click', endRunFromWin);
$('btnRestart').addEventListener('click', () => { setPaused(false); resetRun(false, INTRO_REDIVE); });
$('btnAbort').addEventListener('click', () => { setPaused(false); toTitle(); });
addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!AU.ctx) return;
  // never auto-resume the ambient drones over the pause menu
  document.hidden ? AU.ctx.suspend() : (G.paused || AU.ctx.resume());
});

function playerFire() {
  if (G.tuck) { tone(220, 0.05, 'square', 0.05); return; } // arms are pinned: flare first
  // a latched limpet takes priority: the removal shot is free (no energy,
  // no trace) — the escorts refuse to shoot at her hull, so it's yours
  if (G.limpet) {
    G.limpet = false;
    setLimpetFx(false);
    burst(new THREE.Vector3(player.x, player.y, 0), COL.red, 24, 8);
    feed('LIMPET PURGED // 寄生体除去', 'blue');
    sfx.kill();
    G.layerFired = true; // still a shot: silence is broken
    return;
  }
  if (G.energy < 1) { tone(180, 0.06, 'square', 0.08); return; }
  G.layerFired = true; // this layer is no longer a silent verse
  G.energy--;
  G.trace = Math.min(100, G.trace + 2.5);
  traceTick('+TRACE'); // firing is loud, and the bar says so
  // heavy 3-round amber burst down the flight line (cone-only: steer to aim)
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (G.mode !== 'playing') return;
      const tgt = coneHostile(player.x, player.y);
      if (tgt) G.lastEngaged = tgt; // escorts prioritize what you engage
      fireSpike(player.x, player.y, false, tgt, i === 0 ? 0 : 0.02, i > 0, -1, player.vx || 0, player.vy || 0);
    }, i * 55);
  }
  // escorts open up with the chain guns
  for (const t of kodamas) {
    if (!t.alive) continue;
    t.burst = Math.max(t.burst || 0, 6);
    t.fireT = 0;
  }
}

// ---------------- autopilot (attract mode) ----------------
function autopilot(dt) {
  let tx = Math.sin(G.time * 0.5) * 0.8, ty = Math.cos(G.time * 0.37) * 0.7;
  // aim for the nearest unpassed gate
  let best = null;
  for (const g of gates) {
    const z = g.group.position.z;
    if (g.passed || z > -0.5) continue;
    if (!best || z > best.group.position.z) best = g;
  }
  let gateNear = false;
  if (best) {
    const zb = best.group.position.z;
    gateNear = zb > -45;
    const t = -zb / G.speed;
    const hotGap = best.gaps.find(gp => gp.hot);
    const gap = (hotGap && G.trace > 50) ? hotGap : best.gaps[0];
    const a = gap.center + best.group.rotation.z + best.rotSpeed * Math.min(t, 1.2);
    tx = Math.cos(a) * 2.7;
    ty = Math.sin(a) * 2.7;
  }
  // dodge nearby hazards (softer when threading an imminent gate)
  const dodgeW = gateNear ? 0.35 : 1;
  for (const list of [mines, hunters]) {
    for (const h of list) {
      const p = h.group.position;
      if (p.z < -60 || p.z > 2) continue;
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 2.0) {
        const push = (2.0 - d) * 2.4 * dodgeW;
        tx += (dx / (d + 0.01)) * push;
        ty += (dy / (d + 0.01)) * push;
      }
    }
  }
  for (const b of bullets) {
    const p = b.mesh.position;
    if (p.z < -40 || p.z > 2) continue;
    const dx = tx - p.x, dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.6) { tx += (dx / (d + 0.01)) * 2.4 * dodgeW; ty += (dy / (d + 0.01)) * 2.4 * dodgeW; }
  }
  const m = Math.hypot(tx, ty);
  if (m > PLAY_R) { tx *= PLAY_R / m; ty *= PLAY_R / m; }
  player.tx = tx; player.ty = ty;
  // occasionally shoot hunters
  autopilot.fireT = (autopilot.fireT || 0) - dt;
  if (autopilot.fireT <= 0 && G.energy > 0) {
    const swarm = G.traced > 0 || hunters.length >= 3;
    const target = hunters.find(h => {
      const p = h.group.position;
      return p.z > -220 && p.z < -12 && Math.hypot(p.x - player.x, p.y - player.y) < (swarm ? 3.2 : 2.2);
    });
    if (target) { playerFire(); autopilot.fireT = swarm ? 0.55 : 0.8; }
  }
}

// ---------------- layer / spawn director ----------------
// after a deep death the next dive skips the empty-sky drought: spawn
// intensity gets a floor so "one more run" costs seconds, not half a minute.
// (a restart fix, not a checkpoint — score, depth and threats still reset)
let effFloor = 0;
function layerName(i) {
  if (i < LAYER_NAMES.length) return LAYER_NAMES[i];
  return [`DEEP STRATA ${String(i + 1).padStart(2, '0')}`, '深層領域'];
}
function director(dt) {
  const L = Math.floor(G.dist / LAYER_LEN);
  if (L > G.layer && !G.chor) { // layers stop counting once she appears
    G.layer = L;
    const [en, jp] = layerName(L);
    ui.layerName.textContent = (G.loop > 1 ? `DIVE ${String(G.loop).padStart(2, '0')} // ` : '') + en;
    if (!G.auto && MUSIC.current === 'dive') playTrack('dive', true); // deepen the score
    if (!fxMuted()) {
      announce(`LAYER ${String(L + 1).padStart(2, '0')}/09 // ${en}`, jp);
      addScore(250, 'LAYER BREACH', 'amber');
      sfx.layer();
      // (escorts no longer re-arm at every breach: losing one has stakes —
      // recovery is the 16s timer or killing the feral kodama)
      // SILENT VERSE: a whole layer crossed without a single trigger pull
      if (L > 0 && !G.layerFired) {
        addScore(800, 'SILENT VERSE // 静寂層突破', 'blue');
        if (!G.iceSilent && Math.random() < 0.5) { G.iceSilent = true; iceSay('silentLayer'); }
        else chat('silentVerse');
      }
      if (L >= 7 && G.trace < 30 && !G.iceDeep) { G.iceDeep = true; iceSay('deepQuiet'); }
      // layer identity moments
      if (L % 9 === 3) feed('DATA PODS AHEAD — THEFT RAISES TRACE // 窃取ハ痕跡ヲ残ス', 'amber');
      if (L % 9 === 6) feed('SILT WALL — SENSOR RANGE FAILING // 視界悪化', 'red');
    }
    G.layerFired = false; // each layer judges silence fresh
    if (L >= 9 && !G.chor) spawnChorister(); // the endgame: she waits at the seat
  }
  const D = DIFF();
  // deeper dives (loop 2+) replay the layers harder
  // training ignores the warm-start floor (always calm) without wiping a
  // floor the player legitimately earned for their next real run
  const eff = Math.max(G.layer + (G.loop - 1) * 6, G.training ? 0 : effFloor);
  G.speed = Math.min(46 + eff * D.spd, 115 + (G.loop - 1) * 10) * (G.traced > 0 ? 1.12 : 1)
    * (1 + 0.35 * (G.tuckK || 0)); // tucked: falling faster

  if (!G.chor) { // ceasefire during the chorister approach
    const gateEvery = Math.max(68, 108 - eff * 5) * D.cad;
    if (G.dist > G.nextGate) { spawnGate(); G.nextGate = G.dist + gateEvery * (0.85 + Math.random() * 0.3); }
    if (eff >= 1 && G.dist > G.nextMine) {
      spawnMineCluster();
      G.nextMine = G.dist + Math.max(34, 60 - eff * 4) * D.cad * (0.8 + Math.random() * 0.5);
    }
    if (G.dist > G.nextPickup) {
      // flyline left the random table: it's the GRAVEKEEPER's guaranteed drop only
      spawnPickup(['bt', 'breaker'][Math.floor(Math.random() * 2)]);
      G.nextPickup = G.dist + (G.training ? 150 + Math.random() * 80 : 600 + Math.random() * 350);
    }
    // MEMORY VAULT (layer 04): data pods, big score, loud theft
    if (G.layer % 9 === 3 && G.dist > G.nextVault) {
      spawnPickup('data');
      G.nextVault = G.dist + 70 + Math.random() * 50;
    }
    if (eff >= 1 && G.dist > G.nextHunter) {
      spawnHunter();
      if (eff >= 4 && Math.random() < 0.5) spawnHunter();
      G.nextHunter = G.dist + Math.max(95, 210 - eff * 18) * D.cad * (0.8 + Math.random() * 0.5);
    }
    if (eff >= 5 && G.dist > G.nextShell) {
      spawnShellCluster();
      G.nextShell = G.dist + (300 + Math.random() * 200) * D.cad;
    }
    if (eff >= 6 && ferals.length === 0 && G.dist > G.nextFeral) {
      spawnFeral();
      G.nextFeral = G.dist + (520 + Math.random() * 300) * D.cad;
    }
    if (eff >= 4 && keepers.length === 0 && G.dist > G.nextKeeper) {
      spawnKeeper();
      G.nextKeeper = G.dist + (950 + Math.random() * 450) * D.cad;
    }
    // the limpet hunts alone, never while the barrier already sees you, and
    // never in attract mode (the autopilot has no fire key to purge with)
    if (eff >= 2 && !G.auto && G.traced <= 0 && !G.limpet && limpets.length === 0 && G.dist > G.nextLimpet) {
      spawnLimpet();
      G.nextLimpet = G.dist + (520 + Math.random() * 320) * D.cad;
    }
  }

  // trace pressure (a latched limpet screams your position: x4;
  // tucking is faster and therefore louder: the stealth axis taxes it)
  G.trace = Math.min(100, G.trace +
    ((0.85 + eff * 0.15) * D.trace * (G.limpet ? 4 : 1) + (G.tuckK || 0) * 1.5) * dt);
  if (G.trace >= 50 && !G.ice50) { G.ice50 = true; iceSay('trace50'); }
  if (G.trace >= 80 && !G.traceWarned && G.traced <= 0) {
    G.traceWarned = true;
    if (!fxMuted()) { announce('TRACE LOCK IMMINENT', '逆探知間近', true, 1400); sfx.alarm(); }
  }
  if (G.trace < 60) G.traceWarned = false; // vented back down: re-arm the warning
  if (G.trace >= 100 && G.traced <= 0 && !G.chor) { // the ceasefire covers detection too: no storm-farming her approach
    G.traced = 8;
    G.tracedSurvive = 0;
    document.body.classList.add('traced');
    if (!G.auto) playTrack('traced');
    if (!fxMuted()) {
      announce('TRACED // COUNTERSONG DEPLOYED', '逆探知完了 対抗聖歌展開', true, 2400);
      chat('traced');
      iceSay(G.eliteSeen ? 'eliteReturn' : 'eliteIntro');
    }
    // FUDO's own shell leads the storm: the elite takes the SHALLOWEST
    // slot (largest z arrives first) so "coming down to meet you" is true
    const stormN = 3 + Math.min(G.layer, 3);
    for (let i = 0; i < stormN; i++) spawnHunter(SPAWN_Z + i * 40, i === stormN - 1);
    G.eliteSeen = true;
  }
  if (G.traced > 0) {
    G.traced -= dt;
    G.alarmT -= dt;
    if (G.alarmT <= 0) { sfx.alarm(); G.alarmT = 0.9; }
    if (G.traced <= 0) {
      G.trace = 28;
      document.body.classList.remove('traced');
      if (!G.auto) playTrack('dive', true);
      if (!fxMuted()) {
        // flat payout, never through the multiplier: evading is relief,
        // not a x8 jackpot to farm
        G.score += 1500;
        feed('+1,500 TRACE EVADED // 逃げ切った', 'amber');
        announce('TRACE EVADED', '逆探知ヲ振リ切ッタ', false, 1600);
        iceSay('evaded');
        sfx.evaded();
        G.bt = Math.min(8, G.bt + 3); // evading the countersong sharpens the diver
        G.slowmo = 0.5;
        flash('breach', 0.3, 400);
        shockwave(player.x, player.y, COL.amber, 9);
      }
    }
  }
}

// ---------------- main update ----------------
const clock = new THREE.Clock();
function step(dt) {
  if (G.autoRedive) { G.autoRedive = false; resetRun(true); }
  G.time += dt;
  if (G.trigger && !G.auto && !G.tuck) G.layerFired = true; // holding the guns is loud too
  // tuck blend: drives pose, speed, steering weight, fov, wind
  G.tuckK = THREE.MathUtils.clamp(
    (G.tuckK || 0) + ((G.tuck && G.mode === 'playing' && G.intro <= 0) ? dt * 5 : -dt * 5), 0, 1);
  // SILT WALL (layer 07): the fog closes in, gates resolve late,
  // her light becomes the only thing that reads
  G.blackK = THREE.MathUtils.clamp(
    (G.blackK || 0) + ((G.layer % 9 === 6 && G.mode === 'playing') ? dt * 1.2 : -dt * 1.2), 0, 1);
  scene.fog.near = 70 - 32 * G.blackK;
  scene.fog.far = 400 - 235 * G.blackK;
  playerLight.intensity = 10 + 9 * G.blackK;
  playerLight.distance = 14 + 8 * G.blackK;
  // bullet time: the world slows, the diver does not — but time dilation
  // spends stealth (the barrier notices the temporal anomaly)
  if (G.btOn) {
    G.bt -= dt;
    if (G.mode === 'playing' && !G.auto) G.trace = Math.min(100, G.trace + 3 * dt);
    if (G.bt <= 0) {
      G.bt = 0;
      G.btOn = false;
      document.body.classList.remove('bullettime');
      sfx.btToggle(false);
    }
  }
  const ts = Math.max(0.35, (G.slowmo > 0 ? 0.35 : 1) * (G.btOn ? 0.35 : 1)); // bt + slowmo don't stack to a crawl
  if (G.slowmo > 0) G.slowmo -= dt;
  const sdt = dt * ts;

  if (G.mode === 'playing') {
    // ---- materialize + swan-dive intro ----
    if (G.intro > 0) {
      const p = 1 - G.intro / (G.introLen || INTRO_LEN);
      G.introE = p * p * (3 - 2 * p);
      G.intro -= dt;
      player.group.scale.setScalar(THREE.MathUtils.clamp((p - 0.04) / 0.14, 0.001, 1));
      if (!G.introFx && p > 0.05) {
        G.introFx = true;
        shockwave(0, 0, COL.amber, 6);
        burst(new THREE.Vector3(0, 0, 0), COL.amber, 40, 8);
        sfx.respawn();
      }
      kodamas.forEach((t, ti) => {
        if (!t.group.visible && p > 0.3 + ti * 0.12) {
          t.group.visible = true;
          burst(t.group.position.clone(), COL.blue, 26, 7);
          sfx.kodamaFire();
        }
      });
      player.tx = player.ty = 0; // hold center while she gathers
      if (G.intro <= 0 && !G.introFired) {
        G.introFired = true;
        player.group.scale.setScalar(1);
        document.body.classList.remove('intro');
        if (!fxMuted()) {
          announce('DIVE INITIATED', '電脳空間へ降下開始', false, 1600);
          sfx.layer();
          flash('breach', 0.22, 300);
          G.fovKick = 1.1;
          chat('start');
          // first dive ever: one-time verb hint after the opening banner
          if (!localStorage.getItem('ab_hint_v1')) {
            localStorage.setItem('ab_hint_v1', '1');
            setTimeout(() => {
              if (G.mode === 'playing' && !G.auto)
                announce(`${keyLabel(CONTROLS.fire)} — FIRE // ${keyLabel(CONTROLS.tuck)} — TUCK`,
                  '射撃 ト 急降下姿勢', false, 2600);
            }, 2100);
          }
        }
      }
    }
    G.dist += G.speed * sdt;
    G.invuln = Math.max(0, G.invuln - dt);
    G.energyT += dt;
    if (G.energyT > 2.4 && G.energy < 3) { G.energy++; G.energyT = 0; }
    director(sdt);
    if (G.training && !G.auto && G.intro <= 0) trainTick(dt);
    if (G.intro > 0) G.speed *= 0.12 + 0.55 * G.introE; // she is still gathering speed
    // sustained fire lights you up on the trace grid
    if (G.trigger && !G.auto && kodamas.some(t => t.alive)) {
      G.trace = Math.min(100, G.trace + 2.4 * dt);
    }
    if (G.auto && G.intro <= 0) autopilot(dt);
  }

  // ---- player steering ----
  const cl = Math.hypot(player.tx, player.ty);
  let tx = player.tx, ty = player.ty;
  if (cl > PLAY_R) { tx *= PLAY_R / cl; ty *= PLAY_R / cl; }
  // stripped of her escorts she flies lighter: sharper steering response.
  // tucked, she's a dart: fast but 40% heavier on the stick
  const agile = (kodamas.some(t => t.alive) ? 1 : 1.5) * (1 - 0.4 * (G.tuckK || 0));
  const k = 1 - Math.pow(0.0008, dt * agile);
  const px0 = player.x, py0 = player.y;
  player.x += (tx - player.x) * k;
  player.y += (ty - player.y) * k;
  player.vx = (player.x - px0) / Math.max(dt, 1e-4);
  player.vy = (player.y - py0) / Math.max(dt, 1e-4);
  player.group.position.set(player.x, player.y, 0);
  player.group.rotation.z = (player.x - tx) * 0.35 + Math.sin(G.time * 2) * 0.03;
  player.group.rotation.x = (ty - player.y) * 0.2;
  if (player.fig) player.fig.rotation.y = Math.sin(G.time * 1.3) * 0.07;
  applySwan(G.time);
  playerLight.position.set(player.x + 1.2, player.y + 1.5, 2.2);
  if (G.invuln > 0 && G.mode === 'playing') {
    player.group.visible = Math.floor(G.time * 14) % 2 === 0;
  } else if (G.mode !== 'dead') player.group.visible = true;

  // trail
  player.trailPts.unshift(new THREE.Vector3(player.x, player.y, 0));
  if (player.trailPts.length > 24) player.trailPts.pop();
  {
    const pos = player.trail.geometry.attributes.position;
    for (let i = 0; i < 24; i++) {
      const p = player.trailPts[Math.min(i, player.trailPts.length - 1)];
      pos.setXYZ(i, p.x, p.y, i * 0.26);
    }
    pos.needsUpdate = true;
    player.trail.visible = player.group.visible;
  }
  // aura + wake intensity scale with speed so she pops in the deep strata
  {
    const spdK = THREE.MathUtils.clamp((G.speed - 46) / 70, 0, 1);
    player.aura.material.opacity = (0.14 + spdK * 0.2 + (G.btOn ? 0.15 : 0)) *
      (0.9 + Math.sin(G.time * 3.2) * 0.1);
    player.aura.scale.setScalar(1.3 + spdK * 0.5); // ring her, not blanket her
    for (let i = 0; i < player.wake.length; i++) {
      const w = player.wake[i];
      const p = player.trailPts[Math.min(3 + i * 3, player.trailPts.length - 1)];
      w.position.set(p.x, p.y, -0.9 - i * 0.7); // recedes behind her: comet tail, never a veil
      w.material.opacity = (0.10 + spdK * 0.30) * (1 - i / player.wake.length);
      w.visible = player.group.visible;
    }
    // breaker armed indicator: pulsing hex ring, spins faster with more charges
    player.brkRing.visible = G.breaker > 0 && player.group.visible && !G.freelook;
    if (player.brkRing.visible) {
      player.brkRing.rotation.z += dt * (0.8 + G.breaker * 0.5);
      player.brkRing.material.opacity = 0.4 + Math.sin(G.time * 4.5) * 0.25;
      player.brkRing.scale.setScalar(1 + Math.sin(G.time * 4.5) * 0.06);
    }
  }

  // ---- skeletal animations ----
  for (const m of mixers) m.update(sdt);

  // ---- kodama escorts ----
  for (const t of kodamas) {
    t.bob += dt * 3;
    trailTick(t, dt);
    if (!t.alive) {
      t.respawn -= dt;
      // fall away animation
      t.group.position.z += 30 * dt;
      t.group.rotation.x += 4 * dt;
      t.group.rotation.z += 3 * dt;
      if (t.group.position.z > KILL_Z) t.group.visible = false;
      if (t.respawn <= 0 && G.mode === 'playing') {
        t.alive = true; t.group.visible = true;
        t.group.rotation.set(0, 0, 0);
        t.group.position.set(t.side * 8, 0, -30);
        sfx.respawn(); chat('back'); feed('KODAMA REJOINED', 'blue');
      }
      continue;
    }
    const tkE = G.tuckK || 0; // tuck: escorts pull into a tight delta
    const ox = t.side * ((1.7 - 0.95 * tkE) + Math.sin(t.bob) * 0.12 * (1 - tkE));
    const oy = -0.35 + 0.55 * tkE + Math.cos(t.bob * 0.8) * 0.15 * (1 - tkE);
    const gp = t.group.position;
    const gx0 = gp.x, gy0 = gp.y;
    gp.x += (player.x + ox - gp.x) * (1 - Math.pow(0.002, dt));
    gp.y += (player.y + oy - gp.y) * (1 - Math.pow(0.002, dt));
    gp.z += (0.4 - gp.z) * (1 - Math.pow(0.01, dt));
    t.vx = (gp.x - gx0) / Math.max(dt, 1e-4);
    t.vy = (gp.y - gy0) / Math.max(dt, 1e-4);
    // track and auto-engage the closest hostile
    if (G.mode === 'playing') {
      // doctrine: prioritize whatever the player recently engaged
      const engaged = G.lastEngaged && G.lastEngaged.group && G.lastEngaged.group.parent ? G.lastEngaged : null;
      const target = engaged || closestHostile(gp.x, gp.y, gp.z, 260);
      t.aimYaw = t.aimYaw || 0; t.aimPitch = t.aimPitch || 0;
      let wantYaw = 0, wantPitch = 0;
      if (target) {
        const p = target.group.position;
        wantYaw = THREE.MathUtils.clamp(Math.atan2(p.x - gp.x, -(p.z - gp.z)), -0.8, 0.8);
        wantPitch = THREE.MathUtils.clamp(Math.atan2(p.y - gp.y, Math.abs(p.z - gp.z)), -0.6, 0.6);
      }
      const k3 = 1 - Math.pow(0.02, dt);
      t.aimYaw += (wantYaw - t.aimYaw) * k3;
      t.aimPitch += (wantPitch - t.aimPitch) * k3;
      t.group.rotation.y = t.aimYaw + Math.sin(t.bob * 0.6) * 0.06;
      t.group.rotation.x = -t.aimPitch * 0.8;
      t.group.rotation.z = (player.x - gp.x) * 0.25;
      // chain gun: hold the mouse for sustained high-RPM fire (with spin-up),
      // otherwise short auto-bursts when a target is held
      t.burst = t.burst || 0;
      t.roundT = (t.roundT || 0) - dt;
      t.fireT -= dt;
      if (G.trigger && !G.auto && !G.tuck) {
        t.spin = Math.min(1, (t.spin || 0) + dt * 3);
        if (t.roundT <= 0) {
          const mz = kodamaMuzzle(t);
          fireSpike(mz.x, mz.y, true, target || null, 0.04, true, mz.z, t.vx, t.vy);
          t.roundT = THREE.MathUtils.lerp(0.08, 0.022, t.spin);
        }
      } else {
        t.spin = Math.max(0, (t.spin || 0) - dt * 3);
        if (t.burst > 0 && t.roundT <= 0) {
          const mz = kodamaMuzzle(t);
          fireSpike(mz.x, mz.y, true, target || null, 0.035, true, mz.z, t.vx, t.vy);
          t.burst--;
          t.roundT = 0.035;
          if (t.burst === 0) t.fireT = 1.8 + Math.random() * 0.8; // free-fire rate reduced: doctrine, not prohibition
        } else if (t.burst === 0 && t.fireT <= 0) {
          if (target) { t.burst = 7 + Math.floor(Math.random() * 4); chat('kill'); }
          else t.fireT = 0.3;
        }
      }
    } else {
      t.group.rotation.z = (player.x - gp.x) * 0.3;
      t.group.rotation.y = Math.sin(t.bob * 0.6) * 0.15;
    }
    // molten heart shimmer + sensor eyes (amber at rest, tracer-blue while firing)
    if (t.heart) {
      const th = t.bob * 2.1;
      const flick = 0.82 + 0.13 * Math.sin(th) + 0.05 * Math.sin(th * 3.7);
      t.heart[0].material.opacity = 0.95 * flick;
      t.heart[0].scale.setScalar(0.2 + 0.025 * Math.sin(th * 2.3));
      t.heart[1].material.opacity = 0.5 * flick;
    }
    if (t.eyes) {
      const fireK = G.mode === 'playing' ?
        Math.max(t.spin || 0, (t.burst || 0) > 0 ? 1 : 0) : 0;
      for (const e of t.eyes) {
        e.material.color.setHex(0xffc860).lerp(_eyeHot, fireK);
        e.material.opacity = 0.7 + 0.3 * fireK;
        e.scale.setScalar(0.11 + 0.05 * fireK);
      }
    }
  }

  // ---- world scroll ----
  const mv = G.mode === 'playing' ? G.speed * sdt : 6 * sdt;
  for (const r of rings) {
    r.position.z += mv;
    r.rotation.z += sdt * 0.05;
    if (r.position.z > KILL_Z) {
      r.position.z -= RING_COUNT * RING_GAP;
      if (G.mode === 'playing' && !G.auto) { sfx.ring(); }
    }
  }
  outer.rotation.y += sdt * 0.03;

  // dust
  {
    const arr = dust.geometry.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 2] += mv * 1.7;
      if (arr[i + 2] > 10) arr[i + 2] -= 440;
    }
    dust.geometry.attributes.position.needsUpdate = true;
  }
  for (const s of glyphs) {
    s.position.z += mv * 0.4;
    if (s.position.z > 10) s.position.z = SPAWN_Z;
  }
  for (const n of nodes) {
    n.position.z += mv * 0.55;
    n.rotation.x += n.userData.spin * sdt;
    n.rotation.y += n.userData.spin * 0.6 * sdt;
    if (n.position.z > 12) n.position.z = SPAWN_Z - Math.random() * 40;
  }
  for (const s of streams) {
    s.position.z += mv * 0.7;
    if (s.position.z > 12) s.position.z = SPAWN_Z - Math.random() * 60;
  }
  mandala.userData.inner.rotation.z += sdt * 0.06;
  mandala.userData.outer.rotation.z -= sdt * 0.035;
  if (coreShrine) coreShrine.rotation.z += sdt * 0.04;
  if (world.userData.canyon) world.userData.canyon.rotation.y += sdt * 0.01;
  scene.backgroundRotation.z += sdt * 0.012; // the far world slowly swirls around the shaft
  if (world.userData.coreDisc) world.userData.coreDisc.rotation.z += sdt * 0.05;
  // deep strata shift the world violet
  {
    const target = G.layer >= 5 ? 1 : 0;
    G.deepMix = G.deepMix ?? 0;
    G.deepMix += (target - G.deepMix) * (1 - Math.pow(0.5, dt));
    if (world.userData.backAmber) world.userData.backAmber.material.opacity = 1 - G.deepMix;
    if (world.userData.backViolet) world.userData.backViolet.material.opacity = G.deepMix;
  }

  // ---- gates ----
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    const prevZ = g.group.position.z;
    g.group.position.z += mv;
    g.group.rotation.z += g.rotSpeed * sdt;
    const z = g.group.position.z;
    if (!g.passed && prevZ <= 0 && z > 0 && G.mode === 'playing') {
      g.passed = true;
      const pa = Math.atan2(player.y, player.x);
      const pr = Math.hypot(player.x, player.y);
      const margin = Math.atan2(0.42, Math.max(pr, 1.2)); // player half-width as angle
      let through = null, edgeDist = 99;
      for (const gap of g.gaps) {
        let rel = pa - g.group.rotation.z - gap.center;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        if (Math.abs(rel) < gap.half - margin * 0.35) {
          through = gap;
          edgeDist = Math.abs(gap.half - Math.abs(rel));
          break;
        }
      }
      let judged = true;
      if (through) {
        G.chain++;
        // tuck multiplier touches GATES and GRAZES only — never kills,
        // evades, or the merge (the red team's guardrail). Reads the BLEND,
        // not the key: you must be fully committed (paying the speed/trace
        // costs) at the crossing — no free-score frame-taps
        const tuckMul = (G.tuckK || 0) > 0.85 ? 1.5 : 1;
        if (through.hot) {
          // pay scales with how hot you were: the meter is a live price signal
          addScore(Math.round((120 + G.trace * 3) * tuckMul), 'HOT LANE // 突破', 'amber');
          G.trace = Math.max(0, G.trace - 16);
          if (G.traced > 0) G.traced = Math.min(G.traced, 0.05); // a port pass shakes the barrier outright
          if (++G.hotCount === 3) iceSay('hotLaneHabit'); // FUDO reads your habits
          sfx.hot(); chat('hot');
          flash('breach', 0.22, 180);
          G.slowmo = 0.28; G.fovKick = 1;
        } else {
          addScore(Math.round(100 * tuckMul), 'BREACH', '');
          sfx.breach(); if (Math.random() < 0.25) chat('breach');
          G.fovKick = 0.6;
        }
        if (edgeDist < 0.14) { addScore(Math.round(40 * tuckMul), 'GRAZE', 'amber'); G.chain += 0.5; sfx.graze(); }
        burst(new THREE.Vector3(player.x, player.y, 0), through.hot ? COL.amber : COL.ink, 20, 7);
        shockwave(player.x, player.y, through.hot ? COL.amber : COL.ink, through.hot ? 7 : 4.5);
      } else if (G.breaker > 0) {
        // barrier breaker: smash straight through the wall. scores nothing
        // (it forgives the miss, it doesn't reward it) and must never read
        // as damage: gold smash, no red, chain explicitly kept
        G.breaker--;
        announce('CHAIN PRESERVED', '連鎖維持 強行突破', false, 1100);
        feed('BREAKER // 強行突破', 'amber');
        iceSay('breaker');
        sfx.breakerSmash();
        flash('breach', 0.25, 220);
        G.shake = Math.max(G.shake, 0.35);
        G.slowmo = 0.25;
        burst(new THREE.Vector3(player.x, player.y, 0), COL.amber, 46, 13);
        shockwave(player.x, player.y, COL.amber, 7);
      } else {
        damage(g.group.position, 'BARRIER WALL // 障壁');
      }
      if (judged) { shatterGate(g); gates.splice(i, 1); continue; }
    }
    if (z > KILL_Z) { disposeGroup(g.group); gates.splice(i, 1); }
  }

  // ---- shattering gates ----
  for (let i = shatters.length - 1; i >= 0; i--) {
    const s = shatters[i];
    s.age += dt;
    s.group.position.z += mv;
    const k2 = s.age / s.life;
    for (const p of s.parts) {
      p.obj.position.x += p.vx * dt;
      p.obj.position.y += p.vy * dt;
      p.obj.position.z += p.vz * dt;
      p.obj.rotation.z += p.spin * dt;
      p.obj.material.opacity = p.baseOp * (1 - k2);
    }
    if (s.age >= s.life) { disposeGroup(s.group); shatters.splice(i, 1); }
  }

  // ---- mines ----
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    const prevZ = m.group.position.z;
    m.group.position.z += mv;
    m.group.rotation.x += m.spin * sdt;
    m.group.rotation.y += m.spin * 0.7 * sdt;
    const z = m.group.position.z;
    if (G.mode === 'playing' && prevZ <= 0 && z > 0) {
      const d = Math.hypot(m.group.position.x - player.x, m.group.position.y - player.y);
      if (d < 0.95) {
        damage(m.group.position, 'PROXIMITY MINE // 機雷');
        burst(m.group.position.clone(), COL.red, 24, 8);
        disposeGroup(m.group); mines.splice(i, 1); continue;
      } else if (d < 1.9 && !m.grazed) {
        m.grazed = true;
        addScore((G.tuckK || 0) > 0.85 ? 38 : 25, 'GRAZE', 'amber'); G.chain += 0.5; sfx.graze();
      }
    }
    if (z > KILL_Z) { disposeGroup(m.group); mines.splice(i, 1); }
  }

  // ---- hunters ----
  for (let i = hunters.length - 1; i >= 0; i--) {
    const h = hunters[i];
    const g = h.group;
    const prevZ = g.position.z;
    g.position.z += mv;
    g.rotation.z += 2.2 * sdt;
    g.children[0].rotation.x += 3 * sdt;
    // homing
    if (g.position.z < -8) {
      const sp = (5 + G.layer * 1.2) * sdt;
      g.position.x += THREE.MathUtils.clamp(player.x - g.position.x, -sp, sp);
      g.position.y += THREE.MathUtils.clamp(player.y - g.position.y, -sp, sp);
    }
    // firing
    if (G.mode === 'playing' && G.layer >= 3 && g.position.z > -180 && g.position.z < -25) {
      h.fireT -= sdt;
      if (h.fireT <= 0) { spawnBullet(g.position); h.fireT = 1.6 + Math.random() * 0.8; }
    }
    if (G.mode === 'playing' && prevZ <= 0 && g.position.z > 0) {
      const d = Math.hypot(g.position.x - player.x, g.position.y - player.y);
      if (d < 1.15) {
        damage(g.position, 'HUNTER COLLISION // 追跡体');
        burst(g.position.clone(), COL.red, 30, 10);
        disposeGroup(g); hunters.splice(i, 1); continue;
      }
    }
    if (g.position.z > KILL_Z) { disposeGroup(g); hunters.splice(i, 1); }
  }

  // ---- empty vessels: adrift in the foundry ----
  for (let i = shells.length - 1; i >= 0; i--) {
    const s2 = shells[i];
    const g = s2.group;
    const prevZ = g.position.z;
    g.position.z += mv;
    s2.ang += s2.spin * 0.22 * sdt;
    g.position.x = Math.cos(s2.ang) * s2.r;
    g.position.y = Math.sin(s2.ang) * s2.r;
    g.rotation.x += 0.3 * sdt;
    g.rotation.y += 0.22 * sdt;
    if (G.mode === 'playing' && prevZ <= 0 && g.position.z > 0) {
      const d = Math.hypot(g.position.x - player.x, g.position.y - player.y);
      if (d < 1.05) {
        damage(g.position, 'EMPTY VESSEL // 空ノ器');
        shatterShell(s2); shells.splice(i, 1);
        continue;
      } else if (d < 2.0 && !s2.grazed) {
        s2.grazed = true;
        addScore((G.tuckK || 0) > 0.85 ? 53 : 35, 'GRAZE // 空殻', ''); G.chain += 0.5;
        sfx.graze();
      }
    }
    if (g.position.z > KILL_Z) { disposeGroup(g); shells.splice(i, 1); }
  }

  // ---- gravekeepers: slow armored gun platforms ----
  for (let i = keepers.length - 1; i >= 0; i--) {
    const jm = keepers[i];
    const g = jm.group;
    const prevZ = g.position.z;
    g.position.z += mv * 0.9; // heavy: drifts slightly against the flow
    jm.wob += sdt;
    g.rotation.z = Math.sin(jm.wob * 1.3) * 0.12;
    g.rotation.x = Math.cos(jm.wob * 0.9) * 0.08;
    // twin chin gatlings: short bursts at the diver once in range
    if (G.mode === 'playing' && g.position.z > -180 && g.position.z < -25) {
      jm.fireT = (jm.fireT ?? 1.6) - sdt;
      if (jm.fireT <= 0 && !jm.burstN) { jm.burstN = 3; jm.roundT = 0; }
      if (jm.burstN > 0) {
        jm.roundT -= sdt;
        if (jm.roundT <= 0) {
          spawnBullet(g.position);
          jm.burstN--;
          jm.roundT = 0.13;
          if (!jm.burstN) jm.fireT = 2.3 + Math.random();
        }
      }
    }
    if (G.mode === 'playing' && prevZ <= 0 && g.position.z > 0) {
      const d = Math.hypot(g.position.x - player.x, g.position.y - player.y);
      if (d < 1.35) damage(g.position, 'GRAVEKEEPER COLLISION // 墓守');
    }
    if (g.position.z > KILL_Z) { disposeGroup(g); keepers.splice(i, 1); }
  }

  // ---- feral kodama: hunts the escorts, not you ----
  for (let i = ferals.length - 1; i >= 0; i--) {
    const f = ferals[i];
    const g = f.group;
    f.t += sdt;
    f.life += sdt;
    if (f.life > 24) { // gives up and retreats into the deep
      g.position.z -= 90 * sdt;
      if (f.life > 28) { disposeGroup(g); ferals.splice(i, 1); }
      continue;
    }
    g.position.z = Math.min(g.position.z + 55 * sdt, -16);
    const tgt = kodamas.find(t => t.alive);
    const hx = tgt ? tgt.group.position.x + f.side * 3 : f.side * 6;
    const hy = (tgt ? tgt.group.position.y + 1.5 : 2.5) + Math.sin(f.t * 2.1) * 0.8;
    const ke = 1 - Math.pow(0.25, sdt);
    g.position.x += (hx - g.position.x) * ke;
    g.position.y += (hy - g.position.y) * ke;
    if (tgt) g.lookAt(tgt.group.position);
    else g.lookAt(player.x, player.y, 0);
    if (G.mode === 'playing' && g.position.z > -60) {
      f.fireT -= sdt;
      if (f.fireT <= 0) {
        f.fireT = 2.6 + Math.random() * 1.2;
        if (tgt) {
          beam(g.position, tgt.group.position, COL.red);
          sfx.enemyFire();
          burst(tgt.group.position.clone(), COL.red, 8, 5);
          tgt.suppress = (tgt.suppress || 0) + 1;
          if (tgt.suppress >= 3) {
            tgt.suppress = 0;
            tgt.alive = false;
            tgt.respawn = 14;
            sfx.tachDown();
            chat('down');
            burst(tgt.group.position.clone(), COL.blue, 30, 9);
            feed('KODAMA SUPPRESSED // 随伴機損失', 'red');
          } else {
            sfx.hitSpark();
            feed('ESCORT UNDER ATTACK // 随伴機被弾', 'red'); // the rescue is discoverable
          }
        } else {
          beam(g.position, new THREE.Vector3(player.x, player.y, 0), COL.red);
          spawnBullet(g.position);
        }
      }
    }
  }

  // ---- feral-kodama tracer beams fade ----
  for (let i = beams.length - 1; i >= 0; i--) {
    const b2 = beams[i];
    b2.life += dt;
    b2.line.material.opacity = 0.9 * Math.max(0, 1 - b2.life / 0.18);
    if (b2.life > 0.18) { disposeGroup(b2.line); beams.splice(i, 1); }
  }

  // ---- chorister contact: the endgame approach ----
  if (G.chor && !G.chor.done && G.mode === 'playing') {
    const P = G.chor;
    const g = P.group;
    P.t += sdt;
    // she speaks on the way down (gold, through FUDO's channel).
    // only advance past a line once it actually displayed — the channel
    // throttle may eat an attempt, and her lines are not skippable
    if (P.lineN < HARMONY_APPROACH.length && P.t > 0.8 + P.lineN * 2.0) {
      if (iceLine(HARMONY_APPROACH[P.lineN], true, '聖歌手')) P.lineN++;
    }
    // the merge is a held commitment: she only closes while you hold
    // position with her. Drift away and she waits — but not forever:
    // after 25s she comes to you (no softlock, no stall-farming).
    const near = Math.hypot(g.position.x - player.x, g.position.y - player.y) < 1.7;
    if (G.auto || near || P.t > 25) g.position.z = Math.min(g.position.z + 34 * sdt, -8);
    const ke2 = 1 - Math.pow(0.2, sdt);
    if (G.auto) {
      g.position.x += (player.x - g.position.x) * ke2;
      g.position.y += (player.y - g.position.y) * ke2;
    } else {
      // she drifts to the well's center; you come to her
      g.position.x += (0 - g.position.x) * ke2 * 0.4;
      g.position.y += (0 - g.position.y) * ke2 * 0.4;
    }
    P.halo.material.opacity = 0.38 + Math.sin(G.time * 2.5) * 0.15;
    P.halo.scale.setScalar(6.4 + Math.sin(G.time * 1.7) * 0.8);
    if (g.position.z > -12 &&
        Math.hypot(g.position.x - player.x, g.position.y - player.y) < 3.2) merge();
  }
  if (G.chorRedive > 0) { // attract mode merged: quietly restart the loop
    G.chorRedive -= dt;
    if (G.chorRedive <= 0 && G.auto) resetRun(true);
  }

  // ---- trace limpets: approach -> telegraph -> lunge -> latch ----
  for (let i = limpets.length - 1; i >= 0; i--) {
    const lp = limpets[i];
    const g = lp.group;
    g.rotation.x += lp.spin * sdt;
    g.rotation.y += lp.spin * 0.7 * sdt;
    if (lp.state === 'approach') {
      g.position.z += mv;
      if (g.position.z > -30) {
        lp.state = 'telegraph';
        lp.tx = player.x; lp.ty = player.y;
        feed('LIMPET // 寄生体接近', 'red');
        sfx.alarm();
      }
    } else if (lp.state === 'telegraph') {
      // it hangs 30m out, pulsing, tracking you lazily — this is the warning
      lp.holdT -= dt;
      g.scale.setScalar(1 + Math.sin(G.time * 14) * 0.25);
      const kt = 1 - Math.pow(0.3, dt);
      lp.tx += (player.x - lp.tx) * kt;
      lp.ty += (player.y - lp.ty) * kt;
      g.position.x += (lp.tx - g.position.x) * kt;
      g.position.y += (lp.ty - g.position.y) * kt;
      if (lp.holdT <= 0) { lp.state = 'lunge'; lp.tx = player.x; lp.ty = player.y; } // aim locks HERE: dodge after the lock
    } else { // lunge: straight at the locked point, dodgeable by moving
      const prevZ = g.position.z;
      g.position.z += mv + 85 * sdt;
      const kl = 1 - Math.pow(0.15, sdt);
      g.position.x += (lp.tx - g.position.x) * kl;
      g.position.y += (lp.ty - g.position.y) * kl;
      if (G.mode === 'playing' && prevZ <= 0 && g.position.z > 0) {
        if (Math.hypot(g.position.x - player.x, g.position.y - player.y) < 1.05) {
          G.limpet = true;
          setLimpetFx(true);
          chat('limpet'); // NOW the escorts' warning is true
          feed('LIMPET LATCHED — FIRE TO PURGE // 寄生', 'red');
          announce('TRACE LIMPET LATCHED', '寄生体付着 発砲デ除去', true, 2000);
          sfx.hit();
          disposeGroup(g); limpets.splice(i, 1); continue;
        }
      }
    }
    if (g.position.z > KILL_Z) { disposeGroup(g); limpets.splice(i, 1); }
  }
  if (G.limpet && limpetFx) limpetFx.material.opacity = 0.45 + Math.sin(G.time * 10) * 0.35;

  // ---- power-up pickups ----
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const prevZ = p.group.position.z;
    p.group.position.z += mv;
    p.group.rotation.z += p.spin * sdt;
    p.group.children[1].rotation.y += 2.2 * sdt;
    const z = p.group.position.z;
    if (G.mode === 'playing' && prevZ <= 0 && z > 0) {
      const d = Math.hypot(p.group.position.x - player.x, p.group.position.y - player.y);
      if (d < 1.25) {
        awardPickup(p.kind);
        burst(p.group.position.clone(), PICKUP_DEFS[p.kind].color, 26, 8);
        disposeGroup(p.group);
        pickups.splice(i, 1);
        continue;
      }
    }
    if (z > KILL_Z) { disposeGroup(p.group); pickups.splice(i, 1); }
  }
  updateFlyline();
  if (G.flyline > 0 && G.mode === 'playing') G.flyline -= dt;

  // ---- bullets ----
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevZ = b.mesh.position.z;
    b.mesh.position.z += mv;
    b.mesh.position.addScaledVector(b.vel, sdt);
    b.mesh.rotation.x += 6 * sdt;
    const z = b.mesh.position.z;
    if (G.mode === 'playing' && prevZ <= 0 && z > 0) {
      const d = Math.hypot(b.mesh.position.x - player.x, b.mesh.position.y - player.y);
      if (d < 0.8) damage(b.mesh.position, 'TRACER FIRE // 銃撃');
    }
    if (z > KILL_Z || Math.hypot(b.mesh.position.x, b.mesh.position.y) > 14) {
      disposeGroup(b.mesh); bullets.splice(i, 1);
    }
  }

  // ---- spikes (player + kodama shots) ----
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i];
    // gentle in-flight curve toward a still-living target: visible tracer arcs
    if (s.target && s.target.group && s.target.group.parent) {
      const tp = s.target.group.position;
      // escort rounds arc hard; player rounds barely curve — your aim is the aim
      const k5 = Math.min(1, dt * (s.isKodama ? 3.2 : 0.9));
      _muzzleV.set(tp.x - s.mesh.position.x, tp.y - s.mesh.position.y, tp.z - s.mesh.position.z)
        .normalize().multiplyScalar(310);
      s.vel.lerp(_muzzleV, k5);
      s.mesh.lookAt(s.mesh.position.x + s.vel.x, s.mesh.position.y + s.vel.y, s.mesh.position.z + s.vel.z);
    } else if (s.target) {
      s.target = null; // target destroyed: fly straight from here
    }
    s.mesh.position.addScaledVector(s.vel || new THREE.Vector3(0, 0, -300), sdt);
    const sp = s.mesh.position;
    s.life += dt;
    let hit = false;
    // vs hunters (no posthumous scoring)
    if (G.mode === 'playing') for (let j = hunters.length - 1; j >= 0; j--) {
      const h = hunters[j];
      const hp = h.group.position;
      if (Math.abs(hp.z - sp.z) < 6 && Math.hypot(hp.x - sp.x, hp.y - sp.y) < 1.5) {
        h.hp -= s.power;
        hit = true;
        if (h.hp <= 0) {
          addScore(h.elite ? 500 : 150,
            h.elite ? 'FUDO SHELL CRACKED // 不動ノ器撃破' : 'TRACER DOWN // 追跡子撃破',
            s.isKodama ? 'blue' : 'amber');
          if (h.elite) iceSay('eliteDown');
          sfx.kill();
          // no trace refund — shooting is loud. but during TRACED your own
          // kills buy the countdown down: fighting free is real agency
          if (G.traced > 0 && !s.isKodama) G.traced = Math.max(0.05, G.traced - 0.75);
          burst(hp.clone(), COL.red, 30, 10);
          burst(hp.clone(), COL.amber, 14, 16);       // hot spall
          shockwave(hp.x, hp.y, COL.red, 5);
          disposeGroup(h.group); hunters.splice(j, 1);
        } else {
          // chewing through: arcade hit sparks
          burst(sp.clone(), s.isKodama ? COL.blue : COL.amber, 7, 5);
          sfx.hitSpark();
          h.group.rotation.z += 0.3;
        }
        break;
      }
    }
    // vs mines
    if (!hit && G.mode === 'playing') for (let j = mines.length - 1; j >= 0; j--) {
      const mp = mines[j].group.position;
      if (Math.abs(mp.z - sp.z) < 6 && Math.hypot(mp.x - sp.x, mp.y - sp.y) < 1.3) {
        addScore(60, 'SPORE PURGED // 胞子消去', '');
        sfx.kill();
        burst(mp.clone(), COL.ink, 18, 7);
        shockwave(mp.x, mp.y, COL.ink, 3.5);
        disposeGroup(mines[j].group); mines.splice(j, 1);
        hit = true; break;
      }
    }
    // vs empty vessels (one round shatters the porcelain)
    if (!hit && G.mode === 'playing') for (let j = shells.length - 1; j >= 0; j--) {
      const shp = shells[j].group.position;
      if (Math.abs(shp.z - sp.z) < 6 && Math.hypot(shp.x - sp.x, shp.y - sp.y) < 1.2) {
        addScore(40, 'SHELL SHATTERED // 空殻破砕', '');
        shatterShell(shells[j]); shells.splice(j, 1);
        hit = true; break;
      }
    }
    // vs feral kodama (killing it recovers a downed escort)
    if (!hit && G.mode === 'playing') for (let j = ferals.length - 1; j >= 0; j--) {
      const f = ferals[j];
      const fp = f.group.position;
      if (Math.abs(fp.z - sp.z) < 6 && Math.hypot(fp.x - sp.x, fp.y - sp.y) < 1.6) {
        f.hp -= s.power;
        hit = true;
        if (f.hp <= 0) {
          addScore(400, 'FERAL KODAMA DOWN // 暴走機撃破', 'amber');
          sfx.kill();
          burst(fp.clone(), COL.red, 40, 12);
          burst(fp.clone(), COL.blue, 20, 9);
          shockwave(fp.x, fp.y, COL.red, 6);
          const down = kodamas.find(t => !t.alive);
          if (down) { down.respawn = 0.6; feed('ESCORT RECOVERED // 随伴機回収', 'blue'); }
          disposeGroup(f.group); ferals.splice(j, 1);
        } else {
          burst(sp.clone(), s.isKodama ? COL.blue : COL.amber, 7, 5);
          sfx.hitSpark();
        }
        break;
      }
    }
    // vs gravekeepers (tanky; cracking one always drops a power-up)
    if (!hit && G.mode === 'playing') for (let j = keepers.length - 1; j >= 0; j--) {
      const jm = keepers[j];
      const jp2 = jm.group.position;
      if (Math.abs(jp2.z - sp.z) < 6 && Math.hypot(jp2.x - sp.x, jp2.y - sp.y) < 1.4) {
        jm.hp -= s.power;
        hit = true;
        if (jm.hp <= 0) {
          addScore(300, 'GRAVEKEEPER CRACKED // 墓守撃破', 'amber');
          sfx.kill();
          burst(jp2.clone(), COL.amber, 36, 11);
          shockwave(jp2.x, jp2.y, COL.amber, 5);
          spawnPickup('line', jp2); // cracking the gravekeeper always yields the flyline
          disposeGroup(jm.group); keepers.splice(j, 1);
        } else {
          burst(sp.clone(), s.isKodama ? COL.blue : COL.amber, 7, 5);
          sfx.hitSpark();
          jm.group.rotation.y += 0.25;
        }
        break;
      }
    }
    if (hit || sp.z < SPAWN_Z || sp.z > KILL_Z || s.life > 3) {
      disposeGroup(s.mesh);
      spikes.splice(i, 1);
    }
  }

  // ---- muzzle flashes ----
  for (let i = muzzles.length - 1; i >= 0; i--) {
    const m2 = muzzles[i];
    m2.age += dt;
    const k4 = m2.age / m2.life;
    m2.sprite.scale.setScalar(0.9 * (1 - k4 * 0.6));
    m2.sprite.material.opacity = 0.9 * (1 - k4);
    if (m2.age >= m2.life) { disposeGroup(m2.sprite); muzzles.splice(i, 1); }
  }

  // ---- particles ----
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.age += dt;
    const pos = b.points.geometry.attributes.position;
    for (let j = 0; j < b.vels.length; j++) {
      pos.setXYZ(j,
        pos.getX(j) + b.vels[j].x * dt,
        pos.getY(j) + b.vels[j].y * dt,
        pos.getZ(j) + (b.vels[j].z + (G.mode === 'playing' ? G.speed * ts : 0)) * dt);
    }
    pos.needsUpdate = true;
    b.points.material.opacity = 1 - b.age / b.life;
    if (b.age >= b.life) { disposeGroup(b.points); bursts.splice(i, 1); }
  }

  // ---- shockwaves ----
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.age += dt;
    const k2 = w.age / w.life;
    w.line.scale.setScalar(0.4 + k2 * w.size);
    w.line.material.opacity = 0.85 * (1 - k2);
    if (w.age >= w.life) {
      w.line.material.dispose();
      scene.remove(w.line);
      waves.splice(i, 1);
    }
  }

  // ---- dead drift ----
  if (G.mode === 'dead') G.deadT += dt;

  // ---- camera ----
  G.shake = Math.max(0, G.shake - dt * 2.2);
  G.fovKick = Math.max(0, G.fovKick - dt * 2.5);
  if (G.intro > 0 && G.mode === 'playing') {
    // slow orbit: front-left sweep settling slightly above and behind her
    const e = G.introE || 0;
    const th = -2.3 * (1 - e);
    const r = 5.5 + 3.5 * e;
    const h = -0.6 + 2.1 * e;
    camera.position.set(player.x + Math.sin(th) * r, player.y + h, Math.cos(th) * r);
    const lb = THREE.MathUtils.clamp((e - 0.8) / 0.2, 0, 1);
    camera.lookAt(
      THREE.MathUtils.lerp(player.x, player.x * 0.55, lb),
      THREE.MathUtils.lerp(player.y, player.y * 0.55 - 0.5, lb),
      THREE.MathUtils.lerp(-2, -30, lb));
    camera.fov = 64 + 8 * e;
    camera.updateProjectionMatrix();
  } else {
    const shx = (Math.random() - 0.5) * G.shake * 0.5;
    const shy = (Math.random() - 0.5) * G.shake * 0.5;
    camera.position.set(player.x * 0.32 + shx, player.y * 0.32 + 1.5 + shy, 9);
    camera.lookAt(player.x * 0.55, player.y * 0.55 - 0.5, -30);
    camera.rotation.z += Math.sin(G.time * 0.23) * 0.02 + player.x * -0.012;
    camera.fov = 72 + G.fovKick * 9 + (G.mode === 'playing' ? (G.speed - 46) * 0.06 : 0)
      - (G.btOn ? 5 : 0) // bullet time: tighten focus on the world
      + (G.tuckK || 0) * 10; // tuck: the world rushes
    camera.updateProjectionMatrix();
  }

  // ---- audio mood ----
  if (AU.ctx && AU.ctx.state === 'running') {
    const t = AU.ctx.currentTime;
    const active = G.mode === 'playing' && !G.auto;
    AU.humGain.gain.setTargetAtTime(active ? 0.10 + (G.tuckK || 0) * 0.06 : 0.02, t, 0.3);
    AU.humFilter.frequency.setTargetAtTime(200 + G.speed * 2.4 + (G.tuckK || 0) * 260, t, 0.2);
    AU.hum[0].frequency.setTargetAtTime(50 + G.speed * 0.22, t, 0.3);
    AU.hum[1].frequency.setTargetAtTime(50.8 + G.speed * 0.223, t, 0.3);
    AU.traceGain.gain.setTargetAtTime(active ? (G.trace / 100) * 0.028 * (G.traced > 0 ? 2 : 1) : 0, t, 0.2);
    // binaural beat: 2Hz calm -> 10Hz at full trace, +4Hz while TRACED
    const traceBase = 233 + (G.traced > 0 ? Math.sin(G.time * 9) * 40 : 0);
    const traceBeat = 2 + (G.trace / 100) * 8 + (G.traced > 0 ? 4 : 0);
    AU.traceOscs[0].frequency.setTargetAtTime(traceBase - traceBeat / 2, t, 0.05);
    AU.traceOscs[1].frequency.setTargetAtTime(traceBase + traceBeat / 2, t, 0.05);
  }

  // ---- HUD ----
  {
    ui.score.textContent = G.score.toLocaleString();
    ui.mult.textContent = `×${mult().toFixed(1)} CHAIN`;
    ui.depth.textContent = G.loop === 1 && !G.chor
      ? `${Math.round(G.dist)}m / ${LAYER_LEN * 9}m`
      : `${Math.round(G.dist)}m`;
    if (G.traced > 0) {
      // while TRACED the bar becomes the survival countdown
      ui.traceFill.style.left = `${100 - (G.traced / 8) * 100}%`;
      ui.tracePct.textContent = `SURVIVE ${G.traced.toFixed(1)}s`;
    } else {
      ui.traceFill.style.left = `${100 - G.trace}%`;
      ui.tracePct.textContent = `${Math.round(G.trace)}%`;
    }
    ui.integ.innerHTML = Array.from({ length: 4 }, (_, i) =>
      `<div class="blk${i < G.integrity ? '' : ' off'}"></div>`).join('');
    ui.tachUI.innerHTML = kodamas.map(t =>
      `<div class="blk tach${t.alive ? '' : ' off'}"></div>`).join('');
    ui.energy.innerHTML = Array.from({ length: 3 }, (_, i) =>
      `<span class="cell${i < G.energy ? '' : ' off'}"></span>`).join('');
    ui.btFill.style.width = `${(G.bt / 8) * 100}%`;
    document.body.classList.toggle('btactive', G.bt > 0.1 && G.mode === 'playing' && !G.auto);
    ui.breakers.innerHTML = Array.from({ length: 3 }, (_, i) =>
      `<span class="brk${i < G.breaker ? '' : ' off'}"></span>`).join('');
    document.body.classList.toggle('flyline', G.flyline > 0 && G.mode === 'playing');
  }
}

function update() {
  requestAnimationFrame(update);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!G.paused) step(dt);
  else if (G.freelook) {
    // photo mode: orbit the frozen diver; she keeps breathing
    const ch = Math.cos(orbit.pitch);
    camera.position.set(
      player.x + Math.sin(orbit.yaw) * ch * orbit.r,
      player.y + Math.sin(orbit.pitch) * orbit.r,
      Math.cos(orbit.yaw) * ch * orbit.r);
    camera.lookAt(player.x, player.y, 0);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    applySwan(performance.now() / 1000);
  }
  composer.render();
}

// test hooks
window.AB = {
  G, resetRun, gameOver, damage, player, MODELS, kodamas, mixers, SWAN_POSE, swan,
  spawnPickup, pickups, toggleBulletTime,
  startTraining, TRAIN, SETTINGS, openSettings, closeSettings,
  spawnFeral, spawnShellCluster, spawnKeeper, spawnChorister, merge, diveDeeper,
  ferals, shells, keepers,
  demo() { resetRun(false); G.auto = true; G.demoFX = true; },
  sim(seconds) {
    for (let i = 0, n = Math.round(seconds * 60); i < n; i++) step(1 / 60);
    composer.render();
    return { dist: Math.round(G.dist), score: G.score, layer: G.layer, integ: G.integrity, trace: Math.round(G.trace), mode: G.mode };
  },
};

toTitle();
update();
