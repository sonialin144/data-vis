const CANVAS_WIDTH = 3072;
const CANVAS_HEIGHT = 1280;

/** Capsules per scene layer: index 0 = drawn first (back), index 1 = on top (front). */
const CAPSULES_PER_LAYER = [18, 10];

/** Same width for every capsule; height follows capsule art aspect ratio. */
const CAPSULE_DISPLAY_WIDTH = 420;
/** Hero (focused) capsule scales up toward this multiplier at center. */
const SEQ_HERO_SCALE_TARGET = 1.22;

/** Two independent worlds: each gets its own random layout, colors, physics. */
const NUM_SCENE_LAYERS = CAPSULES_PER_LAYER.length;

/** Movement speed scale (pixels per frame at ~60fps). */
const SPEED_MIN = 2.2;
const SPEED_MAX = 5.2;
/** Slight inelasticity so stacks settle (1 = perfectly bouncy). */
const RESTITUTION = 0.92;
/** How much each capsule spins (rad/frame). */
const SPIN_MIN = -0.018;
const SPIN_MAX = 0.018;

/** @type {ReturnType<typeof createCapsuleComponent>} */
let capsule;

/**
 * Circle collider: radius = capsule length / 2 (length = max(w, h) of sprite).
 */
let collisionRadius = 1;

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   vx: number;
 *   vy: number;
 *   angle: number;
 *   spin: number;
 *   animalIndex: number;
 *   shellColor: string;
 *   hopFrame: number;
 *   nextHopFrame: number;
 *   alpha: number;
 *   scatterTx: number;
 *   scatterTy: number;
 * }} CapsuleInst
 */

/** @type {CapsuleInst[][]} one array of instances per layer */
let capsuleLayers = [];

/** When true, draw the circular physics collider. */
let debugCollision = false;

/** One p5.Graphics per layer (rasterize that layer’s capsules only). */
let sceneBuffers = [];

/** Second layer draw: optional nudge (px); both layers use full opacity. */
const SCREEN_LAYER_OFFSET_X = 5;
const SCREEN_LAYER_OFFSET_Y = 4;

/** Random double-hop on the pet (local Y, negative = “up” in capsule space). */
const HOP_SEGMENT_FRAMES = 5;
const HOP_SEGMENTS = 4;
const HOP_TOTAL_FRAMES = HOP_SEGMENT_FRAMES * HOP_SEGMENTS;
const HOP_AMPLITUDE_MAIN = -19;
const HOP_AMPLITUDE_SMALL = -12;
const HOP_INTERVAL_MIN_FRAMES = 220;
const HOP_INTERVAL_MAX_FRAMES = 520;

/** Center text-box obstacle (capsules bounce off this in play). */
const CENTER_BOX_RADIUS = 24;
const CENTER_BOX_COUNT_TEXT = "170,040";
const CENTER_BOX_BODY_LINE_2 =
  "dogs and cats are suffering in shelters across Georgia";
const CENTER_BOX_FONT_FAMILY = "Instrument Sans";
const CENTER_BOX_COUNT_SIZE = 180;
const CENTER_BOX_BODY_SIZE = 44;
const CENTER_BOX_BODY_LEADING = 50;
const CENTER_BOX_LINE_GAP = 14;
const CENTER_BOX_PAD_X = 34;
const CENTER_BOX_PAD_Y = 18;
const CENTER_TEXT_STROKE_W = 24;
const CENTER_LINE2_BG_PAD_X = 42;
const CENTER_LINE2_BG_PAD_Y = 14;
const CENTER_LINE2_BG_EXTRA_H = 34;

/**
 * Sequence: play → scatterFocus (others scatter + hero moves to center together) → morph → done → play.
 * Hero focus uses slower lerps so it usually finishes after scatter. N: start / restore / skip.
 */
let seqPhase = "play";
/** `frameCount` when the current phase began (guards autoplay so step 1 isn’t instant). */
let seqPhaseStartFrame = 0;
/** True after non-heroes are snapped off (scatter leg complete). */
let seqScatterSnapped = false;
/** @type {CapsuleInst[][] | null} */
let seqSnapshot = null;
let seqHeroLayer = 0;
let seqHeroIndex = 0;
/** 0–1 eases hero from normal size → SEQ_HERO_SCALE_TARGET during focus/morph/done. */
let seqHeroScaleT = 0;
/** `millis()` when morph phase started; drives timed dome open (see OPEN_DUR). */
let morphOpenStartMs = null;
/** `millis()` when done phase started; hero animal growth + glow rays (see DONE_*). */
let doneRevealStartMs = null;
/** `millis()` when post-reveal phase started; hero slides + text reveals. */
let postRevealStartMs = null;
let postRevealAnimalName = "Biscuit";
/** Subline under “Meet …”; from meta.json or GACHA_COPY fallback. */
let postRevealAnimalDescription = "";
/** Footer line; from meta.json `location` or GACHA_COPY.footer fallback. */
let postRevealAnimalLocation = "";

/** @type {BroadcastChannel | null} */
let gachaBroadcastChannel = null;
let lastBroadcastPhase = null;
/** @type {string | null} */
let lastBroadcastAnimalName = null;
/** @type {number | null} */
let lastBroadcastAnimalIndex = null;
/** @type {string | null} */
let lastBroadcastShellColor = null;
/** @type {string | null} */
let lastBroadcastAnimalDescription = null;
/** @type {string | null} */
let lastBroadcastAnimalLocation = null;

function gachaChannelName() {
  return (
    (typeof window !== "undefined" && window.GACHA_BROADCAST_CHANNEL_NAME) ||
    "data-vis-gacha"
  );
}

function isDevUiVisible() {
  return (
    typeof document !== "undefined" &&
    document.body &&
    document.body.classList.contains("dev-ui-visible")
  );
}

function postGachaStateNow() {
  if (!gachaBroadcastChannel) return;
  const name = seqPhase === "postReveal" ? postRevealAnimalName : null;
  const animalIdx =
    seqPhase === "postReveal"
      ? capsuleLayers[seqHeroLayer][seqHeroIndex].animalIndex
      : null;
  const shellCol =
    seqPhase === "postReveal"
      ? capsuleLayers[seqHeroLayer][seqHeroIndex].shellColor
      : null;
  lastBroadcastPhase = seqPhase;
  lastBroadcastAnimalName = name;
  lastBroadcastAnimalIndex = animalIdx;
  lastBroadcastShellColor = shellCol != null ? String(shellCol) : null;
  lastBroadcastAnimalDescription =
    seqPhase === "postReveal" ? postRevealAnimalDescription : null;
  lastBroadcastAnimalLocation =
    seqPhase === "postReveal" ? postRevealAnimalLocation : null;
  gachaBroadcastChannel.postMessage({
    type: "STATE",
    phase: seqPhase,
    ...(seqPhase === "postReveal"
      ? {
          animalName: postRevealAnimalName,
          animalDescription: postRevealAnimalDescription,
          animalLocation: postRevealAnimalLocation,
          animalIndex: animalIdx,
          shellColor: shellCol,
        }
      : {}),
  });
}

function broadcastGachaStateIfChanged() {
  if (!gachaBroadcastChannel) return;
  const name = seqPhase === "postReveal" ? postRevealAnimalName : null;
  const animalIdx =
    seqPhase === "postReveal"
      ? capsuleLayers[seqHeroLayer][seqHeroIndex].animalIndex
      : null;
  const shellCol =
    seqPhase === "postReveal"
      ? capsuleLayers[seqHeroLayer][seqHeroIndex].shellColor
      : null;
  const shellKey = shellCol != null ? String(shellCol) : null;
  const desc = seqPhase === "postReveal" ? postRevealAnimalDescription : null;
  const loc = seqPhase === "postReveal" ? postRevealAnimalLocation : null;
  if (
    seqPhase !== lastBroadcastPhase ||
    (seqPhase === "postReveal" &&
      (name !== lastBroadcastAnimalName ||
        animalIdx !== lastBroadcastAnimalIndex ||
        shellKey !== lastBroadcastShellColor ||
        desc !== lastBroadcastAnimalDescription ||
        loc !== lastBroadcastAnimalLocation))
  ) {
    postGachaStateNow();
  }
}

/** Capsule dome open during morph (matches CSS animation duration). */
const OPEN_DUR = 1100;
/** Final dome angle (deg), same as reference `lerp(0, -135, 1)`. */
const MORPH_DOME_OPEN_MAX_DEG = -135;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  const u = constrain(t, 0, 1);
  return 1 - Math.pow(1 - u, 3);
}

/** Hero pet scale-up after dome open (multiplier on drawn animal size, 1 → DONE_ANIMAL_REVEAL_SCALE). */
const DONE_ANIMAL_GROW_MS = 1000;
const DONE_ANIMAL_REVEAL_SCALE = 1.5;
const HERO_OPEN_JUMP_AMP = -44;

const POST_REVEAL_DUR_MS = 1100;
const POST_REVEAL_HERO_SHIFT_X = 620;
const POST_REVEAL_TEXT_AREA_W = 1220;
const POST_REVEAL_TEXT_PAD_X = 80;
const POST_REVEAL_TEXT_SHIFT_X = 48;

const _gachaCopy =
  typeof window !== "undefined" && window.GACHA_COPY ? window.GACHA_COPY : null;
const POST_REVEAL_SUBLINE = (_gachaCopy && _gachaCopy.subline) || "";
const POST_REVEAL_FOOTER = (_gachaCopy && _gachaCopy.footer) || "";

function animalMetaObject() {
  const o =
    typeof window !== "undefined" && window.GACHA_ANIMAL_META
      ? window.GACHA_ANIMAL_META
      : null;
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
}

function animalFilenameForIndex(animalIndex) {
  const files =
    typeof window !== "undefined" && Array.isArray(window.GACHA_ANIMAL_FILES)
      ? window.GACHA_ANIMAL_FILES
      : [];
  const n = files.length;
  if (n === 0) return "";
  const i = floor(constrain(animalIndex, 0, n - 1));
  return files[i] || "";
}

function animalMetaForIndex(animalIndex) {
  const fn = animalFilenameForIndex(animalIndex);
  if (!fn) return null;
  const row = animalMetaObject()[fn];
  if (!row || typeof row !== "object") return null;
  return row;
}

function animalNameFromFilename(filename) {
  if (!filename || typeof filename !== "string") return "friend";
  const base = filename.replace(/\.[^/.]+$/, "");
  const words = base.replace(/[_-]+/g, " ").trim().split(/\s+/);
  if (!words.length || (words.length === 1 && !words[0])) return "friend";
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (/^\d+$/.test(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function animalNameForIndex(animalIndex) {
  const row = animalMetaForIndex(animalIndex);
  if (row && typeof row.name === "string" && row.name.trim()) {
    return row.name.trim();
  }
  const fn = animalFilenameForIndex(animalIndex);
  if (!fn) return "Biscuit";
  return animalNameFromFilename(fn) || "friend";
}

function animalDescriptionForIndex(animalIndex) {
  const row = animalMetaForIndex(animalIndex);
  if (row && typeof row.description === "string" && row.description.trim()) {
    return row.description.trim();
  }
  return POST_REVEAL_SUBLINE;
}

function animalLocationForIndex(animalIndex) {
  const row = animalMetaForIndex(animalIndex);
  if (row && typeof row.location === "string" && row.location.trim()) {
    return row.location.trim();
  }
  return POST_REVEAL_FOOTER;
}

/** Current hero dome rotation (deg) for draw; 0 when closed, MORPH_DOME_OPEN_MAX_DEG when fully open. */
function heroMorphDomeOpenDeg() {
  if (seqPhase === "done" || seqPhase === "postReveal")
    return MORPH_DOME_OPEN_MAX_DEG;
  if (seqPhase !== "morph" || morphOpenStartMs === null) return 0;
  const t = min((millis() - morphOpenStartMs) / OPEN_DUR, 1);
  const e = easeInOutCubic(t);
  return lerp(0, MORPH_DOME_OPEN_MAX_DEG, e);
}

/** Hero-only pop during morph while dome opens (single jump arc). */
function heroMorphJumpOffsetY() {
  if (seqPhase !== "morph" || morphOpenStartMs === null) return 0;
  const t = min((millis() - morphOpenStartMs) / OPEN_DUR, 1);
  return HERO_OPEN_JUMP_AMP * sin(PI * t);
}

function postRevealT() {
  if (seqPhase !== "postReveal" || postRevealStartMs == null) return 0;
  return min((millis() - postRevealStartMs) / POST_REVEAL_DUR_MS, 1);
}

const SEQ_MIN_SCATTER_FRAMES = 18;
/** Min frames from phase start before morph (focus runs in parallel and is tuned to outlast scatter). */
const SEQ_MIN_FOCUS_FRAMES = 42;
/** Hero → center: slower than scatter so focus typically takes longer. */
const SEQ_FOCUS_POS_K = 0.046;
const SEQ_FOCUS_ANGLE_K = 0.046;
const SEQ_FOCUS_SCALE_K = 0.042;

function preload() {
  const metaRaw = loadJSON("assets/animals/meta.json");
  if (typeof window !== "undefined") {
    window.GACHA_ANIMAL_META =
      metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
        ? metaRaw
        : {};
  }
  capsule = createCapsuleComponent();
  capsule.preload();
}

function computeCapsuleCollisionSize() {
  const capH = capsule.displayHeightForWidth(CAPSULE_DISPLAY_WIDTH);
  const length = max(CAPSULE_DISPLAY_WIDTH, capH);
  return {
    displayH: capH,
    length,
    collisionRadius: length / 2,
  };
}

function randomSpeedVector() {
  const a = random(TWO_PI);
  const s = random(SPEED_MIN, SPEED_MAX);
  return { vx: cos(a) * s, vy: sin(a) * s };
}

/** Eased double hop: big up/down, then smaller up/down (frameIndex 1..HOP_TOTAL_FRAMES). */
function hopAnimalOffsetY(frameIndex) {
  if (frameIndex <= 0 || frameIndex > HOP_TOTAL_FRAMES) return 0;
  const seg = HOP_SEGMENT_FRAMES;
  const si = floor((frameIndex - 1) / seg);
  const fi = ((frameIndex - 1) % seg) + 1;
  const u = seg <= 1 ? 1 : (fi - 1) / (seg - 1);
  if (si === 0) return lerp(0, HOP_AMPLITUDE_MAIN, u);
  if (si === 1) return lerp(HOP_AMPLITUDE_MAIN, 0, u);
  if (si === 2) return lerp(0, HOP_AMPLITUDE_SMALL, u);
  if (si === 3) return lerp(HOP_AMPLITUDE_SMALL, 0, u);
  return 0;
}

/** Advance hop timers once per frame (call at end of draw after rendering). */
function updateAnimalHops(instances) {
  for (const inst of instances) {
    if (inst.hopFrame > 0) {
      inst.hopFrame += 1;
      if (inst.hopFrame > HOP_TOTAL_FRAMES) {
        inst.hopFrame = 0;
        inst.nextHopFrame =
          frameCount +
          floor(random(HOP_INTERVAL_MIN_FRAMES, HOP_INTERVAL_MAX_FRAMES));
      }
    } else if (frameCount >= inst.nextHopFrame) {
      inst.hopFrame = 1;
    }
  }
}

function layoutCapsules() {
  capsuleLayers = [];
  const n = capsule.getAnimalCount();
  if (n === 0) return;

  const r = collisionRadius;
  const pad = r + 8;

  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    const instances = [];
    const count = CAPSULES_PER_LAYER[L];
    for (let i = 0; i < count; i++) {
      let x, y;
      let tries = 0;
      do {
        x = random(pad, CANVAS_WIDTH - pad);
        y = random(pad, CANVAS_HEIGHT - pad);
        tries++;
      } while (tries < 120 && circleOverlapsPlaced(x, y, r, i, instances));

      const { vx, vy } = randomSpeedVector();
      instances.push({
        x,
        y,
        vx,
        vy,
        angle: random(TWO_PI),
        spin: random(SPIN_MIN, SPIN_MAX),
        animalIndex: floor(random(n)),
        shellColor: random(CAPSULE_SHELL_PALETTE),
        hopFrame: 0,
        nextHopFrame: floor(random(90, 240)),
        alpha: 255,
        scatterTx: 0,
        scatterTy: 0,
      });
    }
    capsuleLayers.push(instances);
  }
  seqPhase = "play";
  seqPhaseStartFrame = 0;
  seqScatterSnapped = false;
  seqHeroScaleT = 0;
  morphOpenStartMs = null;
  seqSnapshot = null;
}

function snapshotCapsules() {
  return capsuleLayers.map((layer) => layer.map((inst) => ({ ...inst })));
}

function restoreCapsules(snap) {
  for (let L = 0; L < snap.length; L++) {
    for (let i = 0; i < snap[L].length; i++) {
      Object.assign(capsuleLayers[L][i], snap[L][i]);
    }
  }
}

function isSeqHero(L, i) {
  return L === seqHeroLayer && i === seqHeroIndex;
}

/**
 * Buffer coords so that, after `image(sceneBuffers[L], L*OX, L*OY)`, the hero
 * lines up with the true canvas center (parallax offset per layer).
 */
function heroBufferCenterTarget() {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const L = seqHeroLayer;
  return {
    x: cx - L * SCREEN_LAYER_OFFSET_X,
    y: cy - L * SCREEN_LAYER_OFFSET_Y,
  };
}

/** Shortest angular delta from `from` to `to` (radians). */
function shortestAngleDelta(from, to) {
  let d = to - from;
  while (d > PI) d -= TWO_PI;
  while (d < -PI) d += TWO_PI;
  return d;
}

function lerpAngleToward(a, target, t) {
  return a + shortestAngleDelta(a, target) * t;
}

function initScatterTargets() {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const pushDist = 2800;
  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    for (let i = 0; i < capsuleLayers[L].length; i++) {
      const inst = capsuleLayers[L][i];
      const dx = inst.x - cx;
      const dy = inst.y - cy;
      const len = max(80, sqrt(dx * dx + dy * dy));
      inst.scatterTx = cx + (dx / len) * pushDist;
      inst.scatterTy = cy + (dy / len) * pushDist;
      inst.alpha = 255;
    }
  }
}

function snapScatterComplete() {
  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    for (let i = 0; i < capsuleLayers[L].length; i++) {
      if (isSeqHero(L, i)) continue;
      const inst = capsuleLayers[L][i];
      inst.x = inst.scatterTx;
      inst.y = inst.scatterTy;
      inst.alpha = 0;
    }
  }
}

function scatterCompleteEnough() {
  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    for (let i = 0; i < capsuleLayers[L].length; i++) {
      if (isSeqHero(L, i)) continue;
      const inst = capsuleLayers[L][i];
      const dx = inst.x - inst.scatterTx;
      const dy = inst.y - inst.scatterTy;
      if (dx * dx + dy * dy > 36) return false;
      if (inst.alpha > 14) return false;
    }
  }
  return true;
}

function focusCompleteEnough() {
  const h = capsuleLayers[seqHeroLayer][seqHeroIndex];
  const c = heroBufferCenterTarget();
  const dx = h.x - c.x;
  const dy = h.y - c.y;
  if (dx * dx + dy * dy > 49) return false;
  if (abs(shortestAngleDelta(h.angle, 0)) > 0.07) return false;
  if (seqHeroScaleT < 0.82) return false;
  return true;
}

/** Start sequence from idle, or restore layout after sequence completes. */
function advanceSequencePhase() {
  if (seqPhase === "play") {
    seqSnapshot = snapshotCapsules();
    morphOpenStartMs = null;
    doneRevealStartMs = null;
    postRevealStartMs = null;
    seqHeroScaleT = 0;
    seqHeroLayer = NUM_SCENE_LAYERS - 1;
    for (let L = NUM_SCENE_LAYERS - 1; L >= 0; L--) {
      if (capsuleLayers[L].length > 0) {
        seqHeroLayer = L;
        break;
      }
    }
    seqHeroIndex = floor(random(capsuleLayers[seqHeroLayer].length));
    initScatterTargets();
    seqScatterSnapped = false;
    seqPhase = "scatterFocus";
    seqPhaseStartFrame = frameCount;
    return;
  }
  if (seqPhase === "postReveal") {
    if (seqSnapshot) restoreCapsules(seqSnapshot);
    seqPhase = "play";
    seqHeroScaleT = 0;
    morphOpenStartMs = null;
    doneRevealStartMs = null;
    postRevealStartMs = null;
    seqSnapshot = null;
  }
}

/** Skip to the next sub-step while scatterFocus / morph are autoplaying. */
function skipSequencePhase() {
  if (seqPhase === "scatterFocus") {
    snapScatterComplete();
    seqScatterSnapped = true;
    const h = capsuleLayers[seqHeroLayer][seqHeroIndex];
    const c = heroBufferCenterTarget();
    h.x = c.x;
    h.y = c.y;
    h.angle = 0;
    seqHeroScaleT = 1;
    seqPhase = "morph";
    morphOpenStartMs = millis();
    seqPhaseStartFrame = frameCount;
    return;
  }
  if (seqPhase === "morph") {
    morphOpenStartMs = null;
    seqPhase = "postReveal";
    seqPhaseStartFrame = frameCount;
    doneRevealStartMs = millis();
    postRevealStartMs = millis();
    const h = capsuleLayers[seqHeroLayer][seqHeroIndex];
    postRevealAnimalName = animalNameForIndex(h.animalIndex);
    postRevealAnimalDescription = animalDescriptionForIndex(h.animalIndex);
    postRevealAnimalLocation = animalLocationForIndex(h.animalIndex);
  }
}

function updateSequenceAnimation() {
  if (seqPhase === "scatterFocus") {
    const h = capsuleLayers[seqHeroLayer][seqHeroIndex];
    const c = heroBufferCenterTarget();
    h.x = lerp(h.x, c.x, SEQ_FOCUS_POS_K);
    h.y = lerp(h.y, c.y, SEQ_FOCUS_POS_K);
    h.angle = lerpAngleToward(h.angle, 0, SEQ_FOCUS_ANGLE_K);
    seqHeroScaleT = lerp(seqHeroScaleT, 1, SEQ_FOCUS_SCALE_K);
    if (seqHeroScaleT > 0.999) seqHeroScaleT = 1;

    if (!seqScatterSnapped) {
      const k = 0.055;
      for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
        for (let i = 0; i < capsuleLayers[L].length; i++) {
          const inst = capsuleLayers[L][i];
          if (isSeqHero(L, i)) continue;
          inst.x = lerp(inst.x, inst.scatterTx, k);
          inst.y = lerp(inst.y, inst.scatterTy, k);
          inst.alpha = lerp(inst.alpha, 0, 0.09);
        }
      }
      if (
        frameCount - seqPhaseStartFrame >= SEQ_MIN_SCATTER_FRAMES &&
        scatterCompleteEnough()
      ) {
        snapScatterComplete();
        seqScatterSnapped = true;
      }
    }

    if (
      seqScatterSnapped &&
      frameCount - seqPhaseStartFrame >= SEQ_MIN_FOCUS_FRAMES &&
      focusCompleteEnough()
    ) {
      seqPhase = "morph";
      morphOpenStartMs = millis();
      seqPhaseStartFrame = frameCount;
    }
  } else if (seqPhase === "morph") {
    if (morphOpenStartMs === null) morphOpenStartMs = millis();
    const h = capsuleLayers[seqHeroLayer][seqHeroIndex];
    const c = heroBufferCenterTarget();
    const k = 0.08;
    const ka = 0.08;
    h.x = lerp(h.x, c.x, k);
    h.y = lerp(h.y, c.y, k);
    h.angle = lerpAngleToward(h.angle, 0, ka);
    seqHeroScaleT = lerp(seqHeroScaleT, 1, 0.07);
    if (seqHeroScaleT > 0.999) seqHeroScaleT = 1;
    const morphNormT = min((millis() - morphOpenStartMs) / OPEN_DUR, 1);
    if (morphNormT >= 1) {
      morphOpenStartMs = null;
      seqPhase = "postReveal";
      seqPhaseStartFrame = frameCount;
      doneRevealStartMs = millis();
      postRevealStartMs = millis();
      postRevealAnimalName = animalNameForIndex(h.animalIndex);
      postRevealAnimalDescription = animalDescriptionForIndex(h.animalIndex);
      postRevealAnimalLocation = animalLocationForIndex(h.animalIndex);
    }
  } else if (seqPhase === "postReveal") {
    const h = capsuleLayers[seqHeroLayer][seqHeroIndex];
    const c = heroBufferCenterTarget();
    const k = 0.08;
    const ka = 0.08;
    const e = easeInOutCubic(postRevealT());
    const targetX = c.x - POST_REVEAL_HERO_SHIFT_X;
    h.x = lerp(h.x, targetX, k * (0.65 + 0.35 * e));
    h.y = lerp(h.y, c.y, k);
    h.angle = lerpAngleToward(h.angle, 0, ka);
    seqHeroScaleT = lerp(seqHeroScaleT, 1, 0.07);
    if (seqHeroScaleT > 0.999) seqHeroScaleT = 1;
  }
}

function circleOverlapsPlaced(x, y, r, upToIndex, instances) {
  const minD = 2 * r - 1;
  const minD2 = minD * minD;
  for (let j = 0; j < upToIndex; j++) {
    const o = instances[j];
    const dx = x - o.x;
    const dy = y - o.y;
    if (dx * dx + dy * dy < minD2) return true;
  }
  return false;
}

function setup() {
  const c = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  c.parent("sketch-holder");
  const pd = pixelDensity();
  sceneBuffers = [];
  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    const g = createGraphics(CANVAS_WIDTH, CANVAS_HEIGHT);
    g.pixelDensity(pd);
    sceneBuffers.push(g);
  }
  const m = computeCapsuleCollisionSize();
  collisionRadius = m.collisionRadius;
  layoutCapsules();
  const btn = document.getElementById("seq-next-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      if (seqPhase === "play" || seqPhase === "postReveal") {
        advanceSequencePhase();
      } else {
        skipSequencePhase();
      }
    });
  }
  if (typeof BroadcastChannel !== "undefined") {
    gachaBroadcastChannel = new BroadcastChannel(gachaChannelName());
    gachaBroadcastChannel.onmessage = (ev) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "START_GACHA" && seqPhase === "play") {
        advanceSequencePhase();
      } else if (d.type === "RESET_AFTER_REVEAL" && seqPhase === "postReveal") {
        advanceSequencePhase();
      } else if (d.type === "REQUEST_STATE") {
        postGachaStateNow();
      }
    };
    postGachaStateNow();
  }
}

/**
 * Renders one layer into a graphics buffer — transparent except for capsules.
 * Background color comes from the main canvas clear in draw().
 */
function drawCapsuleSceneTo(pg, layerIndex) {
  const instances = capsuleLayers[layerIndex] || [];
  pg.push();
  pg.resetMatrix();
  pg.colorMode(RGB, 255);
  pg.blendMode(BLEND);
  pg.clear();

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const alpha = inst.alpha != null ? inst.alpha : 255;
    if (alpha < 2) continue;

    const isHero =
      seqPhase !== "play" && layerIndex === seqHeroLayer && i === seqHeroIndex;
    const domeOpenDeg =
      isHero &&
      (seqPhase === "morph" || seqPhase === "done" || seqPhase === "postReveal")
        ? heroMorphDomeOpenDeg()
        : 0;

    const heroScale =
      isHero && seqPhase !== "play"
        ? lerp(1, SEQ_HERO_SCALE_TARGET, seqHeroScaleT)
        : 1;
    const displayW = CAPSULE_DISPLAY_WIDTH * heroScale;

    const isDoneHero =
      isHero && (seqPhase === "done" || seqPhase === "postReveal");
    let animalScaleMul = 1;
    let glowElapsedMs = null;
    if (isDoneHero && doneRevealStartMs != null) {
      const el = millis() - doneRevealStartMs;
      const t = min(el / DONE_ANIMAL_GROW_MS, 1);
      animalScaleMul = lerp(1, DONE_ANIMAL_REVEAL_SCALE, easeOutCubic(t));
      glowElapsedMs = el;
    }

    const jumpY = isHero ? heroMorphJumpOffsetY() : 0;

    capsule.drawAt(
      inst.x,
      inst.y,
      displayW,
      inst.angle,
      inst.animalIndex,
      inst.shellColor,
      pg,
      hopAnimalOffsetY(inst.hopFrame) + jumpY,
      domeOpenDeg,
      alpha,
      animalScaleMul,
      glowElapsedMs,
    );
  }

  pg.pop();
}

function updatePhysicsForLayer(instances) {
  const r = collisionRadius;
  const W = CANVAS_WIDTH;
  const H = CANVAS_HEIGHT;

  for (const inst of instances) {
    inst.x += inst.vx;
    inst.y += inst.vy;
    inst.angle += inst.spin;
  }

  for (const inst of instances) {
    if (inst.x - r < 0) {
      inst.x = r;
      inst.vx *= -RESTITUTION;
    } else if (inst.x + r > W) {
      inst.x = W - r;
      inst.vx *= -RESTITUTION;
    }
    if (inst.y - r < 0) {
      inst.y = r;
      inst.vy *= -RESTITUTION;
    } else if (inst.y + r > H) {
      inst.y = H - r;
      inst.vy *= -RESTITUTION;
    }
    // Center text collider disabled for now by request.
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        resolveCircleCollision(instances[i], instances[j], r);
      }
    }
  }
}

function centerBoxBounds() {
  push();
  textFont(CENTER_BOX_FONT_FAMILY);
  textStyle(BOLD);
  textSize(CENTER_BOX_COUNT_SIZE);
  const countW = textWidth(CENTER_BOX_COUNT_TEXT);
  textStyle(NORMAL);
  textSize(CENTER_BOX_BODY_SIZE);
  const bodyLine2W =
    textWidth(CENTER_BOX_BODY_LINE_2) +
    CENTER_TEXT_STROKE_W * 2 +
    CENTER_LINE2_BG_PAD_X * 2 +
    16;
  pop();

  const bodyW = bodyLine2W;
  const bodyH = CENTER_BOX_BODY_LEADING;
  const contentW = max(countW, bodyW);
  const contentH = CENTER_BOX_COUNT_SIZE + CENTER_BOX_LINE_GAP + bodyH;
  const boxW = contentW + CENTER_BOX_PAD_X * 2;
  const boxH = contentH + CENTER_BOX_PAD_Y * 2;
  const cx = CANVAS_WIDTH * 0.5;
  const cy = CANVAS_HEIGHT * 0.5;
  return {
    left: cx - boxW * 0.5,
    right: cx + boxW * 0.5,
    top: cy - boxH * 0.5,
    bottom: cy + boxH * 0.5,
  };
}

/** Resolve circle center vs center text-box (axis-aligned rectangle, expanded by r). */
function resolveCenterBoxCollision(inst, r) {
  const b = centerBoxBounds();
  const exLeft = b.left - r;
  const exRight = b.right + r;
  const exTop = b.top - r;
  const exBottom = b.bottom + r;

  if (
    inst.x < exLeft ||
    inst.x > exRight ||
    inst.y < exTop ||
    inst.y > exBottom
  ) {
    return;
  }

  const dLeft = abs(inst.x - exLeft);
  const dRight = abs(exRight - inst.x);
  const dTop = abs(inst.y - exTop);
  const dBottom = abs(exBottom - inst.y);
  const minD = min(dLeft, dRight, dTop, dBottom);

  if (minD === dLeft) {
    inst.x = exLeft;
    inst.vx = -abs(inst.vx) * RESTITUTION;
  } else if (minD === dRight) {
    inst.x = exRight;
    inst.vx = abs(inst.vx) * RESTITUTION;
  } else if (minD === dTop) {
    inst.y = exTop;
    inst.vy = -abs(inst.vy) * RESTITUTION;
  } else {
    inst.y = exBottom;
    inst.vy = abs(inst.vy) * RESTITUTION;
  }
}

function updatePhysics() {
  for (const instances of capsuleLayers) {
    updatePhysicsForLayer(instances);
  }
}

function resolveCircleCollision(a, b, r) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distSq = dx * dx + dy * dy;
  const minDist = 2 * r;
  if (distSq < 1e-6) {
    const push = random(TWO_PI);
    dx = cos(push) * 0.01;
    dy = sin(push) * 0.01;
    distSq = dx * dx + dy * dy;
  }

  const dist = sqrt(distSq);
  if (dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = minDist - dist;
  const correction = overlap * 0.5 + 0.25;
  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;

  const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (approach <= 0) return;

  const e = RESTITUTION;
  const impulseScalar = (-(1 + e) * approach) / 2;

  a.vx += impulseScalar * nx;
  a.vy += impulseScalar * ny;
  b.vx -= impulseScalar * nx;
  b.vy -= impulseScalar * ny;

  const kick = abs(impulseScalar) * 0.0012;
  a.spin += kick * (random() - 0.5);
  b.spin -= kick * (random() - 0.5);
}

function drawCollisionDebugOverlay() {
  const d = collisionRadius * 2;
  const layerColors = [
    [80, 255, 120],
    [200, 80, 255],
  ];
  push();
  noFill();
  strokeWeight(4);
  for (let L = 0; L < capsuleLayers.length; L++) {
    const rgb = layerColors[L % layerColors.length];
    stroke(rgb[0], rgb[1], rgb[2], 220);
    for (const inst of capsuleLayers[L]) {
      circle(inst.x, inst.y, d);
      stroke(255, 180, 60, 200);
      line(inst.x - 12, inst.y, inst.x + 12, inst.y);
      line(inst.x, inst.y - 12, inst.x, inst.y + 12);
      stroke(rgb[0], rgb[1], rgb[2], 220);
    }
  }
  // Center text collider debug box hidden while collider is disabled.
  pop();
}

function drawCenterTextBox() {
  const b = centerBoxBounds();
  const textLeft = b.left + CENTER_BOX_PAD_X;
  const textTop = b.top + CENTER_BOX_PAD_Y;
  const textW = b.right - b.left - CENTER_BOX_PAD_X * 2;
  const textCenterX = (b.left + b.right) * 0.5;
  const bodyTop = textTop + CENTER_BOX_COUNT_SIZE + CENTER_BOX_LINE_GAP;
  push();
  const ctx = drawingContext;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  stroke("#3989BC");
  strokeWeight(CENTER_TEXT_STROKE_W + 2);
  strokeJoin(ROUND);
  textFont(CENTER_BOX_FONT_FAMILY);
  textStyle(BOLD);
  textAlign(CENTER, TOP);
  textSize(CENTER_BOX_COUNT_SIZE);
  fill("#ffffff");
  text(
    CENTER_BOX_COUNT_TEXT,
    textLeft,
    textTop,
    textW,
    CENTER_BOX_COUNT_SIZE + 10,
  );

  // stroke(255);
  // strokeWeight(CENTER_TEXT_STROKE_W);
  // text(CENTER_BOX_COUNT_TEXT, textLeft, textTop, textW, CENTER_BOX_COUNT_SIZE + 10);

  textStyle(NORMAL);
  fill(248);
  textSize(CENTER_BOX_BODY_SIZE);
  textLeading(CENTER_BOX_BODY_LEADING);
  const line2Top = bodyTop;
  const line2TextW = textWidth(CENTER_BOX_BODY_LINE_2);
  const line2RectX = textCenterX - line2TextW * 0.5 - CENTER_LINE2_BG_PAD_X;
  const line2RectY = line2Top + CENTER_LINE2_BG_PAD_Y;
  const line2RectW = line2TextW + CENTER_LINE2_BG_PAD_X * 2;
  const line2RectH =
    CENTER_BOX_BODY_LEADING -
    CENTER_LINE2_BG_PAD_Y * 2 +
    CENTER_LINE2_BG_EXTRA_H;
  noStroke();
  fill("#F17170");
  rectMode(CORNER);
  rect(line2RectX, line2RectY, line2RectW, line2RectH, 0);
  noStroke();
  fill("fff");
  textStyle(BOLDITALIC);
  textAlign(CENTER, CENTER);
  text(CENTER_BOX_BODY_LINE_2, textCenterX, line2RectY + line2RectH * 0.5);
  ctx.restore();
  pop();
}

function drawPostRevealPanel() {
  if (seqPhase !== "postReveal" || postRevealStartMs == null) return;
  const t = postRevealT();
  const e = easeOutCubic(t);
  const a = 255 * e;

  const cx = CANVAS_WIDTH * 0.5;
  const cy = CANVAS_HEIGHT * 0.5;
  const left = cx - 10 + (1 - e) * POST_REVEAL_TEXT_SHIFT_X;
  const top = cy - 210;

  push();
  const ctx = drawingContext;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  textFont(CENTER_BOX_FONT_FAMILY);
  textAlign(LEFT, TOP);

  noStroke();
  fill(255, a);
  textStyle(BOLD);
  textSize(92);
  text(
    `Meet ${postRevealAnimalName}`,
    left + POST_REVEAL_TEXT_PAD_X,
    top,
    POST_REVEAL_TEXT_AREA_W,
  );

  textStyle(NORMAL);
  textSize(40);
  fill(255, a * 0.92);
  text(
    postRevealAnimalDescription || POST_REVEAL_SUBLINE,
    left + POST_REVEAL_TEXT_PAD_X,
    top + 118,
    POST_REVEAL_TEXT_AREA_W,
  );

  textSize(32);
  fill(255, a * 0.82);
  text(
    postRevealAnimalLocation || POST_REVEAL_FOOTER,
    left + POST_REVEAL_TEXT_PAD_X,
    top + 190,
    POST_REVEAL_TEXT_AREA_W,
  );

  ctx.restore();
  pop();
}

function draw() {
  background(0);
  updateSequenceAnimation();
  if (seqPhase === "play") {
    updatePhysics();
  }

  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    drawCapsuleSceneTo(sceneBuffers[L], L);
  }

  for (let L = 0; L < NUM_SCENE_LAYERS; L++) {
    image(
      sceneBuffers[L],
      L * SCREEN_LAYER_OFFSET_X,
      L * SCREEN_LAYER_OFFSET_Y,
    );
  }

  if (debugCollision) {
    drawCollisionDebugOverlay();
  }

  if (seqPhase === "play") {
    drawCenterTextBox();
  }
  if (seqPhase === "postReveal") {
    drawPostRevealPanel();
  }

  if (isDevUiVisible()) {
    fill(235);
    textSize(28);
    textAlign(LEFT, TOP);
    text(
      "R reset  ·  D debug  ·  N start/restore or skip  ·  " +
        (debugCollision ? "colliders ON" : "colliders OFF") +
        "  ·  phase: " +
        seqPhase,
      32,
      32,
    );
  }

  if (seqPhase === "play") {
    for (const layer of capsuleLayers) {
      updateAnimalHops(layer);
    }
  }

  broadcastGachaStateIfChanged();
}

function keyPressed() {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "r") {
    layoutCapsules();
  } else if (k === "d") {
    debugCollision = !debugCollision;
  } else if (k === "n") {
    if (seqPhase === "play" || seqPhase === "postReveal") {
      advanceSequencePhase();
    } else {
      skipSequencePhase();
    }
  }
}
