let video;
let poseModel;

// ---------------------------------------------------------------------------
// BODY POSE CONFIG
// We use ml5.bodyPose with MoveNet MultiPose, which detects full skeletons
// from across a room. We extract LEFT_WRIST and RIGHT_WRIST as toy anchors.
// This replaces the old HandPose approach which required hands to be close.
// ---------------------------------------------------------------------------

/**
 * MoveNet keypoint indices we care about.
 * Full list: https://docs.ml5js.org/#/reference/body-pose
 */
const KP_LEFT_WRIST = 9;
const KP_RIGHT_WRIST = 10;
const KP_LEFT_ELBOW = 7;
const KP_RIGHT_ELBOW = 8;

/**
 * Minimum confidence for a keypoint to be used as a toy anchor.
 * Lower = more detections at range but more jitter. 0.2 is a good start.
 */
const MIN_WRIST_CONFIDENCE = 0.2;

/**
 * Minimum overall person confidence to bother reading their wrists.
 */
const MIN_PERSON_CONFIDENCE = 0.15;

// ---------------------------------------------------------------------------

const PET_SHEETS = [
  {
    name: "dog-1",
    idlePath: "./assets/1 Dog/Idle.png",
    walkPath: "./assets/1 Dog/Walk.png",
  },
  {
    name: "dog-2",
    idlePath: "./assets/2 Dog 2/Idle.png",
    walkPath: "./assets/2 Dog 2/Walk.png",
  },
  {
    name: "cat-1",
    idlePath: "./assets/3 Cat/Idle.png",
    walkPath: "./assets/3 Cat/Walk.png",
  },
  {
    name: "cat-2",
    idlePath: "./assets/4 Cat 2/Idle.png",
    walkPath: "./assets/4 Cat 2/Walk.png",
  },
];

const PET_3D = { name: "dog-3d", kind: "3d" };
const PET_DOG_VISUAL_OPTIONS = [PET_SHEETS[0], PET_SHEETS[1], PET_3D];
const PET_CAT_VISUAL_OPTIONS = [PET_SHEETS[2], PET_SHEETS[3]];

const PET_DISPLAY_NAMES = [
  "Winky",
  "Cosmo",
  "Snowball",
  "Baxter",
  "Mochi",
  "Pepper",
  "Scout",
  "Noodle",
  "Biscuit",
  "Luna",
];

/**
 * Each active wrist becomes one toy slot entry.
 * Format: { x, y, d } in video-pixel space, plus which person/side it belongs to.
 * @type {Array<{ x: number; y: number; d: number }>}
 */
let activeToys = [];

let handSlots = [];
let dog3d = null;

function pickPetVisual() {
  if (!dog3d) return random(PET_SHEETS);
  const dogW = PET_DOG_VISUAL_OPTIONS.length;
  const catW = PET_CAT_VISUAL_OPTIONS.length;
  return random(dogW + catW) < dogW
    ? random(PET_DOG_VISUAL_OPTIONS)
    : random(PET_CAT_VISUAL_OPTIONS);
}

let modelReady = false;
const MAX_PEOPLE = 6; // MoveNet MultiPose supports up to 6 people
const interfaceWidth = 3072;
const interfaceHeight = 1280;
const scaleStorageKey = "handposePrototypeInterfaceScale";
const scaleStep = 0.05;
const minInterfaceScale = 0.2;
const maxInterfaceScale = 2.5;
let interfaceScale = 1;
const chaseSpeed = 8;
const petRenderSize = 288;
const spriteFrameSize = 48;
const walkFrameThreshold = 0.25;
const DEBUG_POSE = false;
const SPEECH_BUBBLE_REACH_DISTANCE = 48;
const TOY_REACH_DISTANCE = 8;
const PET_NEAR_TOY_LOCK_RADIUS = 32;
const HAND_MOVE_RETARGET_DISTANCE = 32;
const HAND_MOVE_RETARGET_DELAY_MS = 150;

const TEXT_OVERLAY = 22;
const TEXT_WAITING = 26;
const TEXT_SPEECH_BUBBLE = 30;
const TEXT_FALLBACK_PET = 26;
const TEXT_DEBUG = 22;
const TEXT_CENTER_INSTRUCTION = 56;
const TEXT_SHELTER_LABEL = 52;
const CENTER_INSTRUCTION = "Hold Out Your Hand For A Surprise!";
const SHELTER_LABEL = "Animal Shelter";
const SPAWN_HOME_ASSET_PATH = "./assets/spawn-home-source.png";
const SPAWN_HOME_CHROMA_TOLERANCE = 20;
const SPAWN_POINT = {
  // Front-of-house anchor for the centered house image.
  x: interfaceWidth / 2,
  y: interfaceHeight / 2 - 140,
};

// ---------------------------------------------------------------------------
// PRELOAD / SETUP / DRAW
// ---------------------------------------------------------------------------

function preload() {
  for (const sheet of PET_SHEETS) {
    sheet.idleImage = loadImage(sheet.idlePath);
    sheet.walkImage = loadImage(sheet.walkPath);
  }
  return loadDogViewer();
}

function setup() {
  const canvas = createCanvas(interfaceWidth, interfaceHeight);
  canvas.parent("canvas-holder");
  applySavedScale();
  applyInterfaceScale();
  noSmooth();

  const canvasEl =
    canvas.elt || document.querySelector("#canvas-holder canvas");
  const dogHolder = document.getElementById("dog-webgl-layer");
  if (
    dogHolder &&
    canvasEl &&
    canvasEl.parentElement === dogHolder.parentElement
  ) {
    canvasEl.parentElement.appendChild(dogHolder);
  }
  if (canvasEl) canvasEl.style.backgroundColor = "transparent";
  clear();
  makeSpawnBaseBackgroundTransparent();

  if (!window.isSecureContext) {
    setStatus("Camera needs localhost or HTTPS. Open via a local server.");
  }

  video = createCapture(
    {
      video: {
        facingMode: "user",
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    },
    () => setStatus("Webcam stream received. Preparing video..."),
  );
  video.parent("camera-layer");
  video.style("width", `${interfaceWidth}px`);
  video.style("height", `${interfaceHeight}px`);
  video.style("object-fit", "cover");
  video.style("transform", "scaleX(-1)");
  video.style("transform-origin", "center center");
  video.elt.setAttribute("playsinline", "");
  video.elt.muted = true;
  video.elt.onloadedmetadata = () => {
    console.log(
      "[camera] Resolution:",
      video.elt.videoWidth,
      "x",
      video.elt.videoHeight,
    );
    video.elt
      .play()
      .then(() => setStatus("Webcam ready. Loading pose model..."))
      .catch(() => setStatus("Camera blocked. Allow permission and reload."));
  };
  video.elt.onerror = () =>
    setStatus("Could not access webcam. Check browser permission settings.");

  setupBodyPose();

  if (typeof createSprite !== "function") {
    setStatus("Webcam active. p5.play failed to load, using fallback pets.");
  }
}

function draw() {
  clear();

  if (!(video && video.elt && video.elt.readyState >= 2)) {
    fill(220);
    textAlign(CENTER, CENTER);
    textSize(TEXT_WAITING);
    text("Waiting for webcam video...", width / 2, height / 2);
  }

  syncHandsAndToys();
  if (DEBUG_POSE) drawPoseDebug();
  drawToyIfPresent();
  updatePetBehavior();
  if (typeof drawSprites === "function") drawSprites();
  if (dog3d) dog3d.update();
  drawWinkySpeechBubbleIfAtToy();
  drawOverlayText();
}

function windowResized() {
  applyInterfaceScale();
  if (dog3d) dog3d.resize();
  for (const slot of handSlots) {
    const s = slot.petSprite;
    if (s && s.position) {
      s.position.x = constrain(s.position.x, 20, width - 20);
      s.position.y = constrain(s.position.y, 20, height - 20);
    }
  }
}

function keyPressed() {
  if (keyCode === UP_ARROW) {
    setInterfaceScale(interfaceScale + scaleStep);
    return false;
  }
  if (keyCode === DOWN_ARROW) {
    setInterfaceScale(interfaceScale - scaleStep);
    return false;
  }
}

// ---------------------------------------------------------------------------
// BODY POSE SETUP
// ---------------------------------------------------------------------------

/**
 * Latest raw pose results from ml5, updated by the detectStart callback.
 * @type {any[]}
 */
let rawPoses = [];

function setupBodyPose() {
  setStatus("Loading body pose model...");

  // ml5.bodyPose with MoveNet multipose — detects up to 6 people at once,
  // works at room scale, runs in real time on most hardware.
  poseModel = ml5.bodyPose(
    "MoveNet",
    {
      modelType: "MULTIPOSE_LIGHTNING", // fast multi-person model
      enableSmoothing: true,
      minPoseScore: MIN_PERSON_CONFIDENCE,
    },
    () => {
      modelReady = true;
      setStatus("Pose model loaded. Step into view and raise a hand!");
      // detectStart streams results continuously via callback
      poseModel.detectStart(video.elt, (results) => {
        rawPoses = results || [];
      });
    },
  );
}

// ---------------------------------------------------------------------------
// WRIST → TOY EXTRACTION
// ---------------------------------------------------------------------------

/**
 * Converts a MoveNet keypoint (video-pixel coords) into a canvas-space toy.
 * The toy diameter is fixed since we no longer have hand-width data.
 */
function wristToToy(kp) {
  if (!kp || kp.confidence < MIN_WRIST_CONFIDENCE) return null;
  const mapped = mapVideoToCanvas(kp.x, kp.y);
  return { x: mapped.x, y: mapped.y, d: 60 };
}

/**
 * Reads rawPoses and builds a flat list of toy positions — one per visible wrist.
 * Each person can contribute up to 2 toys (left + right wrist).
 */
function buildActiveToys() {
  const toys = [];
  for (const pose of rawPoses) {
    // pose.score may not exist in all ml5 versions; fall back to truthy check
    if (pose.score !== undefined && pose.score < MIN_PERSON_CONFIDENCE)
      continue;

    const kps = pose.keypoints;
    if (!kps) continue;

    const leftWrist = kps[KP_LEFT_WRIST];
    const rightWrist = kps[KP_RIGHT_WRIST];

    const lt = wristToToy(leftWrist);
    const rt = wristToToy(rightWrist);
    if (lt) toys.push(lt);
    if (rt) toys.push(rt);
  }
  return toys;
}

// ---------------------------------------------------------------------------
// HAND SLOT / TOY MANAGEMENT
// ---------------------------------------------------------------------------

function ensureHandSlots(n) {
  const { x: spawnX, y: spawnY } = SPAWN_POINT;
  if (typeof createSprite === "function") {
    while (handSlots.length < n) {
      const petSprite = createSprite(
        spawnX,
        spawnY,
        44,
        44,
      );
      petSprite.maxSpeed = chaseSpeed;
      petSprite.friction = 0.05;
      const petSheet = pickPetVisual();
      if (
        dog3d &&
        petSheet?.kind === "3d" &&
        typeof petSprite.visible !== "undefined"
      ) {
        petSprite.visible = false;
      }
      handSlots.push({
        petSprite,
        wasPetAtToy: false,
        toy: null,
        rawToy: null,
        toyMoveCandidateStartMs: 0,
        petSheet,
        facingRight: true,
        petDisplayName: random(PET_DISPLAY_NAMES),
      });
    }
    while (handSlots.length > n) {
      const slot = handSlots.pop();
      if (slot.petSprite && typeof slot.petSprite.remove === "function")
        slot.petSprite.remove();
    }
  } else {
    while (handSlots.length < n) {
      handSlots.push({
        petSprite: {
          position: { x: spawnX, y: spawnY },
          velocity: { x: 0, y: 0 },
        },
        wasPetAtToy: false,
        toy: null,
        rawToy: null,
        toyMoveCandidateStartMs: 0,
        petSheet: pickPetVisual(),
        facingRight: true,
        petDisplayName: random(PET_DISPLAY_NAMES),
      });
    }
    while (handSlots.length > n) handSlots.pop();
  }
  if (dog3d) dog3d.ensureSlotInstances(handSlots);
}

function makeSpawnBaseBackgroundTransparent() {
  const spawnImg = document.getElementById("spawn-base-image");
  if (!spawnImg) return;

  const source = new Image();
  source.crossOrigin = "anonymous";
  source.onload = () => {
    const w = source.width;
    const h = source.height;
    if (!w || !h) return;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const baseR = data[0];
    const baseG = data[1];
    const baseB = data[2];
    const t = SPAWN_HOME_CHROMA_TOLERANCE;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (
        Math.abs(r - baseR) <= t &&
        Math.abs(g - baseG) <= t &&
        Math.abs(b - baseB) <= t
      ) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    spawnImg.src = canvas.toDataURL("image/png");
  };
  source.src = SPAWN_HOME_ASSET_PATH;
}

function syncHandsAndToys() {
  if (!modelReady) {
    ensureHandSlots(0);
    return;
  }

  activeToys = buildActiveToys();

  if (activeToys.length === 0) {
    ensureHandSlots(0);
    setStatus("Step into view and raise a hand!");
    return;
  }

  ensureHandSlots(activeToys.length);
  for (let i = 0; i < activeToys.length; i++) {
    handSlots[i].rawToy = activeToys[i];
  }

  const n = activeToys.length;
  setStatus(
    n === 1
      ? "Wrist detected — pet is running to you!"
      : `${n} wrists detected — ${n} pets!`,
  );
}

// ---------------------------------------------------------------------------
// DRAWING
// ---------------------------------------------------------------------------

function drawToyIfPresent() {
  for (const slot of handSlots) {
    const toy = slot.toy;
    if (!toy) continue;
    noStroke();
    fill(236, 82, 82);
    circle(toy.x, toy.y, toy.d);
    fill(255, 170, 170, 220);
    circle(toy.x - toy.d * 0.18, toy.y - toy.d * 0.18, toy.d * 0.3);
  }
}

function updatePetBehavior() {
  if (handSlots.length === 0) return;

  for (let si = 0; si < handSlots.length; si++) {
    const slot = handSlots[si];
    const petSprite = slot.petSprite;
    const rawToy = slot.rawToy;

    if (!rawToy) {
      slot.toy = null;
      slot.toyMoveCandidateStartMs = 0;
      petSprite.velocity.x *= 0.9;
      petSprite.velocity.y *= 0.9;
      slot.wasPetAtToy = false;
      continue;
    }

    if (!slot.toy) {
      slot.toy = { ...rawToy };
      slot.toyMoveCandidateStartMs = 0;
    } else {
      const petDistanceToLatchedToy = dist(
        petSprite.position.x,
        petSprite.position.y,
        slot.toy.x,
        slot.toy.y,
      );
      const petIsNearLatchedToy =
        petDistanceToLatchedToy <= PET_NEAR_TOY_LOCK_RADIUS;
      const handMoveSinceLatch = dist(
        rawToy.x,
        rawToy.y,
        slot.toy.x,
        slot.toy.y,
      );

      if (!petIsNearLatchedToy) {
        slot.toy = { ...rawToy };
        slot.toyMoveCandidateStartMs = 0;
      } else if (handMoveSinceLatch >= HAND_MOVE_RETARGET_DISTANCE) {
        if (!slot.toyMoveCandidateStartMs) {
          slot.toyMoveCandidateStartMs = millis();
        }
        if (
          millis() - slot.toyMoveCandidateStartMs >=
          HAND_MOVE_RETARGET_DELAY_MS
        ) {
          slot.toy = { ...rawToy };
          slot.toyMoveCandidateStartMs = 0;
        }
      } else {
        slot.toyMoveCandidateStartMs = 0;
      }
    }

    const toy = slot.toy;

    const dir = createVector(
      toy.x - petSprite.position.x,
      toy.y - petSprite.position.y,
    );
    const distanceToToy = dir.mag();
    const atToy = distanceToToy <= TOY_REACH_DISTANCE;

    if (atToy && !slot.wasPetAtToy) {
      console.log("[pet] Reached toy", {
        handSlot: si,
        distancePx: Math.round(distanceToToy * 10) / 10,
      });
    }
    slot.wasPetAtToy = atToy;

    if (distanceToToy > TOY_REACH_DISTANCE) {
      dir.normalize().mult(chaseSpeed);
      petSprite.velocity.x = dir.x;
      petSprite.velocity.y = dir.y;
      if (abs(dir.x) > 0.05) slot.facingRight = dir.x > 0;
    } else {
      // Hard stop at target to avoid micro-jitter from residual velocity.
      petSprite.velocity.x = 0;
      petSprite.velocity.y = 0;
    }
  }

  if (typeof drawSprites !== "function") {
    for (const slot of handSlots) {
      const p = slot.petSprite;
      p.position.x = constrain(p.position.x + p.velocity.x, 20, width - 20);
      p.position.y = constrain(p.position.y + p.velocity.y, 20, height - 20);
    }
  }

  for (const slot of handSlots) drawPetSpriteShapeAt(slot);
}

function drawPetSpriteShapeAt(slot) {
  if (slot.petSheet?.kind === "3d") return;
  push();
  drawAnimatedPetSprite(
    slot.petSprite.position.x,
    slot.petSprite.position.y,
    petRenderSize,
    slot.facingRight,
    slot.petSprite,
    slot.petSheet,
  );
  pop();
}

function drawAnimatedPetSprite(
  centerX,
  centerY,
  renderSize,
  facingRight,
  petSprite,
  sheet,
) {
  if (sheet?.kind === "3d") return;
  if (!sheet || !sheet.idleImage || !sheet.walkImage) {
    noStroke();
    fill(80, 255, 120);
    circle(centerX, centerY, 80);
    fill(20);
    textAlign(CENTER, CENTER);
    textSize(TEXT_FALLBACK_PET);
    text(sheet?.name ?? "pet", centerX, centerY + 1);
    return;
  }
  const speed = sqrt(petSprite.velocity.x ** 2 + petSprite.velocity.y ** 2);
  const isWalking = speed > walkFrameThreshold;
  const spriteSheet = isWalking ? sheet.walkImage : sheet.idleImage;
  const frameCount = isWalking ? 6 : 4;
  const frameIndex = floor(frameCount * ((millis() * 0.006) % 1));
  const sourceX = frameIndex * spriteFrameSize;
  imageMode(CENTER);
  translate(centerX, centerY);
  if (!facingRight) scale(-1, 1);
  image(
    spriteSheet,
    0,
    0,
    renderSize,
    renderSize,
    sourceX,
    0,
    spriteFrameSize,
    spriteFrameSize,
  );
}

function slotIsCloseToToy(slot) {
  if (!slot.toy || !slot.petSprite) return false;
  return (
    dist(
      slot.petSprite.position.x,
      slot.petSprite.position.y,
      slot.toy.x,
      slot.toy.y,
    ) <= SPEECH_BUBBLE_REACH_DISTANCE
  );
}

function petBubbleLine(slot) {
  return `Hi, I'm ${slot.petDisplayName}!`;
}

function drawWinkySpeechBubbleIfAtToy() {
  for (const slot of handSlots) {
    if (slotIsCloseToToy(slot)) drawWinkySpeechBubbleForPet(slot);
  }
}

function drawWinkySpeechBubbleForPet(slot) {
  const {
    position: { x: px, y: py },
  } = slot.petSprite;
  const bubbleText = petBubbleLine(slot);
  push();
  textSize(TEXT_SPEECH_BUBBLE);
  textStyle(NORMAL);
  const padX = 24,
    padY = 14;
  const tw = textWidth(bubbleText);
  const bubbleW = tw + padX * 2;
  const bubbleH = max(52, textAscent() + textDescent() + padY * 2);
  const lift = 118;
  const bubbleCx = constrain(px, bubbleW / 2 + 10, width - bubbleW / 2 - 10);
  const bubbleCy = py - lift;
  const bubbleBottom = bubbleCy + bubbleH / 2;
  noStroke();
  fill(255, 255, 255, 245);
  rectMode(CENTER);
  rect(bubbleCx, bubbleCy, bubbleW, bubbleH, 16);
  stroke(45, 45, 55, 200);
  strokeWeight(2);
  noFill();
  rect(bubbleCx, bubbleCy, bubbleW, bubbleH, 16);
  const tailW = 22;
  const tailMidX = constrain(
    px,
    bubbleCx - bubbleW / 2 + 24,
    bubbleCx + bubbleW / 2 - 24,
  );
  fill(255, 255, 255, 245);
  noStroke();
  triangle(
    tailMidX - tailW / 2,
    bubbleBottom,
    tailMidX + tailW / 2,
    bubbleBottom,
    px,
    py - 36,
  );
  stroke(45, 45, 55, 200);
  strokeWeight(2);
  noFill();
  line(tailMidX - tailW / 2, bubbleBottom, px, py - 36);
  line(tailMidX + tailW / 2, bubbleBottom, px, py - 36);
  line(tailMidX - tailW / 2, bubbleBottom, tailMidX + tailW / 2, bubbleBottom);
  noStroke();
  fill(35, 38, 48);
  textAlign(CENTER, CENTER);
  text(bubbleText, bubbleCx, bubbleCy);
  rectMode(CORNER);
  pop();
}

function drawOverlayText() {
  fill(255);
  textSize(TEXT_OVERLAY);
  textAlign(LEFT, TOP);
  const n = handSlots.length;
  const label =
    n === 0
      ? "—"
      : n === 1
        ? (handSlots[0].petSheet?.name ?? "pet")
        : `${n} pets`;
  text(`Pet: ${label}`, 12, 10);

  push();
  textAlign(CENTER, CENTER);
  textSize(TEXT_CENTER_INSTRUCTION);
  textStyle(BOLD);
  stroke(0, 0, 0, 180);
  strokeWeight(8);
  fill(190, 220, 255, 245);
  text(CENTER_INSTRUCTION, width / 2, height / 2 - 360);
  pop();

  push();
  textAlign(CENTER, CENTER);
  textSize(TEXT_SHELTER_LABEL);
  textStyle(BOLD);
  stroke(0, 0, 0, 185);
  strokeWeight(9);
  fill(231, 88, 88, 250);
  text(SHELTER_LABEL, width / 2, height / 2 + 290 - height * 0.1);
  pop();
}

/**
 * Debug overlay: draws wrist keypoints and person bounding boxes.
 * Set DEBUG_POSE = true at the top to enable.
 */
function drawPoseDebug() {
  if (!modelReady || !rawPoses || rawPoses.length === 0) {
    fill(255, 120, 120);
    textSize(TEXT_DEBUG);
    textAlign(LEFT, TOP);
    text("No pose detected", 12, 36);
    return;
  }
  for (const pose of rawPoses) {
    const kps = pose.keypoints;
    if (!kps) continue;
    for (const kp of kps) {
      if (!kp || kp.confidence < MIN_WRIST_CONFIDENCE) continue;
      const m = mapVideoToCanvas(kp.x, kp.y);
      noStroke();
      fill(80, 255, 170);
      circle(m.x, m.y, 10);
    }
    // Highlight wrists specifically
    for (const idx of [KP_LEFT_WRIST, KP_RIGHT_WRIST]) {
      const kp = kps[idx];
      if (!kp || kp.confidence < MIN_WRIST_CONFIDENCE) continue;
      const m = mapVideoToCanvas(kp.x, kp.y);
      noStroke();
      fill(255, 80, 80);
      circle(m.x, m.y, 18);
    }
  }
}

// ---------------------------------------------------------------------------
// VIDEO LAYOUT / MAPPING
// ---------------------------------------------------------------------------

function getVideoLayout() {
  const vw = video?.elt?.videoWidth || width;
  const vh = video?.elt?.videoHeight || height;
  const scale = max(width / vw, height / vh);
  const displayW = vw * scale;
  const displayH = vh * scale;
  return {
    vw,
    vh,
    scale,
    offsetX: (width - displayW) / 2,
    offsetY: (height - displayH) / 2,
  };
}

function mapVideoToCanvas(videoX, videoY) {
  const layout = getVideoLayout();
  return {
    x: layout.offsetX + (1 - videoX / layout.vw) * (layout.vw * layout.scale),
    y: layout.offsetY + (videoY / layout.vh) * (layout.vh * layout.scale),
  };
}

// ---------------------------------------------------------------------------
// SCALE PERSISTENCE
// ---------------------------------------------------------------------------

function applySavedScale() {
  const raw = window.localStorage.getItem(scaleStorageKey);
  if (!raw) return;
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed))
    interfaceScale = constrain(parsed, minInterfaceScale, maxInterfaceScale);
}

function setInterfaceScale(nextScale) {
  interfaceScale = constrain(nextScale, minInterfaceScale, maxInterfaceScale);
  window.localStorage.setItem(scaleStorageKey, interfaceScale.toFixed(2));
  applyInterfaceScale();
}

function applyInterfaceScale() {
  const root = document.getElementById("interface-root");
  if (root) root.style.transform = `scale(${interfaceScale})`;
}

// ---------------------------------------------------------------------------
// 3-D DOG LOADER (unchanged)
// ---------------------------------------------------------------------------

async function loadDogViewer() {
  const holder = document.getElementById("dog-webgl-layer");
  if (!holder) return;
  try {
    const THREE = await import("three");
    const { GLTFLoader } =
      await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js");
    const { clone: cloneSkinnedModel } =
      await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js");

    const scene = new THREE.Scene();
    const halfW = interfaceWidth / 2,
      halfH = interfaceHeight / 2;
    const camera = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      0.1,
      500,
    );
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(interfaceWidth, interfaceHeight);
    if ("outputColorSpace" in renderer)
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    holder.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(4, 14, 10);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.35);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) =>
      loader.load(
        "./stylized_dog_low_poly/scene.gltf",
        resolve,
        undefined,
        reject,
      ),
    );

    const templateModel = gltf.scene;
    templateModel.updateMatrixWorld(true);
    const size0 = new THREE.Vector3();
    new THREE.Box3().setFromObject(templateModel).getSize(size0);
    const fitScale = 160 / Math.max(size0.y, 1e-4);
    templateModel.scale.setScalar(fitScale);
    templateModel.updateMatrixWorld(true);
    const bT = new THREE.Box3().setFromObject(templateModel);
    templateModel.position.x -= (bT.min.x + bT.max.x) / 2;
    templateModel.position.y -= bT.min.y;
    templateModel.position.z -= (bT.min.z + bT.max.z) / 2;
    templateModel.rotation.y = THREE.MathUtils.degToRad(-45);

    templateModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          mat.metalness = 0;
          mat.roughness = 1;
          if ("envMapIntensity" in mat) mat.envMapIntensity = 0;
          if (mat.map) {
            mat.emissiveMap = mat.map;
            mat.emissive.set(1, 1, 1);
            mat.emissiveIntensity = 1;
            mat.color.set(0, 0, 0);
          } else {
            mat.emissive.copy(mat.color);
            mat.emissiveIntensity = 1;
            mat.color.set(0, 0, 0);
          }
          mat.needsUpdate = true;
        } else if (mat.emissive && mat.color) {
          mat.emissive.copy(mat.color);
          mat.emissiveIntensity = 1;
        }
      }
    });

    const clips = gltf.animations || [];
    const idleClip = THREE.AnimationClip.findByName(clips, "idle");
    const walkClip = THREE.AnimationClip.findByName(clips, "walk");
    const slotInstances = [];
    const clock = new THREE.Clock();
    const moveSpeedThreshold = 0.32,
      fadeSec = 0.24;

    function syncWalkIdleForInstance(inst, speed) {
      const wantWalk = speed > moveSpeedThreshold;
      if (wantWalk === inst.animIsWalk) return;
      inst.animIsWalk = wantWalk;
      const { idleAction, walkAction } = inst;
      if (idleAction && walkAction) {
        if (wantWalk) {
          idleAction.fadeOut(fadeSec);
          walkAction.reset().fadeIn(fadeSec).play();
        } else {
          walkAction.fadeOut(fadeSec);
          idleAction.reset().fadeIn(fadeSec).play();
        }
      } else if (idleAction && !wantWalk) {
        idleAction.reset().fadeIn(0.1).play();
      } else if (walkAction && wantWalk) {
        walkAction.reset().fadeIn(0.1).play();
      }
    }

    function addDogInstance() {
      const cloned = cloneSkinnedModel(templateModel);
      const petRoot = new THREE.Group();
      scene.add(petRoot);
      petRoot.add(cloned);
      const mixer = new THREE.AnimationMixer(cloned);
      const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
      const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
      if (idleAction) {
        idleAction.loop = THREE.LoopRepeat;
        idleAction.play();
      }
      if (walkAction) {
        walkAction.loop = THREE.LoopRepeat;
        walkAction.stop();
      }
      return {
        petRoot,
        model: cloned,
        mixer,
        idleAction,
        walkAction,
        animIsWalk: false,
        facingX: 1,
      };
    }

    function removeDogInstance(inst) {
      if (!inst) return;
      inst.mixer.stopAllAction();
      scene.remove(inst.petRoot);
    }

    dog3d = {
      ensureSlotInstances(slots) {
        while (slotInstances.length > slots.length)
          removeDogInstance(slotInstances.pop());
        while (slotInstances.length < slots.length) slotInstances.push(null);
        for (let i = 0; i < slots.length; i++) {
          const want3d = slots[i].petSheet?.kind === "3d";
          if (want3d && !slotInstances[i]) slotInstances[i] = addDogInstance();
          else if (!want3d && slotInstances[i]) {
            removeDogInstance(slotInstances[i]);
            slotInstances[i] = null;
          }
        }
      },
      update() {
        const dt = Math.min(clock.getDelta(), 0.1);
        for (let i = 0; i < handSlots.length; i++) {
          const inst = slotInstances[i];
          if (!inst) continue;
          const slot = handSlots[i];
          if (!slot?.petSprite) continue;
          inst.mixer.update(dt);
          const {
            velocity: { x: vx, y: vy },
            position: { x: px, y: py },
          } = slot.petSprite;
          syncWalkIdleForInstance(inst, Math.hypot(vx, vy));
          if (vx > 0.08) inst.facingX = -1;
          else if (vx < -0.08) inst.facingX = 1;
          inst.petRoot.scale.set(inst.facingX, 1, 1);
          inst.petRoot.position.set(
            px - interfaceWidth / 2,
            -(py - interfaceHeight / 2),
            0,
          );
        }
        renderer.render(scene, camera);
      },
      resize() {
        const hw = interfaceWidth / 2,
          hh = interfaceHeight / 2;
        camera.left = -hw;
        camera.right = hw;
        camera.top = hh;
        camera.bottom = -hh;
        camera.updateProjectionMatrix();
        renderer.setSize(interfaceWidth, interfaceHeight);
      },
    };
  } catch (err) {
    console.warn("3D dog failed to load, sprite pets only.", err);
    dog3d = null;
    setStatus(
      "3D dog failed to load — sprite pets only. See browser console for details.",
    );
  }
}

function setStatus(message) {
  const el = document.getElementById("status");
  if (el) el.textContent = message;
}
