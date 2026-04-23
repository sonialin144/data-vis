let video;
let poseModel;

// ---------------------------------------------------------------------------
// BODY POSE CONFIG
// ---------------------------------------------------------------------------

const KP_LEFT_WRIST = 9;
const KP_RIGHT_WRIST = 10;
const KP_LEFT_ELBOW = 7;
const KP_RIGHT_ELBOW = 8;

const MIN_WRIST_CONFIDENCE = 0.2;
const MIN_PERSON_CONFIDENCE = 0.15;

// ---------------------------------------------------------------------------

const PET_SHEETS = [
  { name: "dog-1",              idlePath: "./assets/1 Dog/Idle.png",                  walkPath: "./assets/1 Dog/Walk.png" },
  { name: "dog-2",              idlePath: "./assets/2 Dog 2/Idle.png",                walkPath: "./assets/2 Dog 2/Walk.png" },
  { name: "cat-1",              idlePath: "./assets/3 Cat/Idle.png",                  walkPath: "./assets/3 Cat/Walk.png" },
  { name: "cat-2",              idlePath: "./assets/4 Cat Blue White/Idle.png",       walkPath: "./assets/4 Cat Blue White/Walk.png" },
  { name: "cat-black-white",    idlePath: "./assets/3 Cat Black White/Idle.png",      walkPath: "./assets/3 Cat Black White/Walk.png" },
  { name: "cat-brown-white",    idlePath: "./assets/3 Cat Brown White/Idle.png",      walkPath: "./assets/3 Cat Brown White/Walk.png" },
  { name: "cat-white-grey",     idlePath: "./assets/3 Cat White Grey/Idle.png",       walkPath: "./assets/3 Cat White Grey/Walk.png" },
  { name: "dog-black-white",    idlePath: "./assets/1 Dog Black White/Idle.png",      walkPath: "./assets/1 Dog Black White/Walk.png" },
  { name: "dog-brown-dark",     idlePath: "./assets/2 Dog Brown Dark Brown/Idle.png", walkPath: "./assets/2 Dog Brown Dark Brown/Walk.png" },
  { name: "dog-white-lt-brown", idlePath: "./assets/2 Dog White Light Brown/Idle.png",walkPath: "./assets/2 Dog White Light Brown/Walk.png" },
];

// const PET_3D = { name: "dog-3d", kind: "3d" };
const PET_DOG_VISUAL_OPTIONS = [PET_SHEETS[0], PET_SHEETS[1]];
const PET_CAT_VISUAL_OPTIONS = [PET_SHEETS[2], PET_SHEETS[3]];

// Per-pet sprite assignment (index = petIndex). null = pick randomly from species pool.
const PET_SHEET_ASSIGNMENT = [
  PET_SHEETS[9],  // 0 Ambree  – dog-white-lt-brown
  PET_SHEETS[5],  // 1 Bunny   – cat-brown-white
  PET_SHEETS[4],  // 2 Dexter  – cat-black-white
  PET_SHEETS[8],  // 3 Drako   – dog-brown-dark
  PET_SHEETS[9],  // 4 Elmer   – dog-white-lt-brown
  PET_SHEETS[7],  // 5 Frazier – dog-black-white
  PET_SHEETS[6],  // 6 Frida   – cat-white-grey
  PET_SHEETS[2],  // 7 Hubert  – cat-1 (original orange)
  PET_SHEETS[7],  // 8 Jesse   – dog-black-white
  PET_SHEETS[5],  // 9 Journey – cat-brown-white
];

// Pet data in pet-index order (matches real-pet-images folder names)
const PET_DISPLAY_NAMES = [
  "Ambree", "Bunny", "Dexter", "Drako", "Elmer",
  "Frazier", "Frida", "Hubert", "Jesse", "Journey",
];

// true = cat, false = dog  (index matches PET_DISPLAY_NAMES / PET_DATA)
const PET_IS_CAT = [
  false, // 0 Ambree  – dog
  true,  // 1 Bunny   – cat
  true,  // 2 Dexter  – cat
  false, // 3 Drako   – dog
  false, // 4 Elmer   – dog
  false, // 5 Frazier – dog
  true,  // 6 Frida   – cat
  true,  // 7 Hubert  – cat
  false, // 8 Jesse   – dog
  true,  // 9 Journey – cat
];

const PET_DATA = [
  { name: "Ambree",  photo: "./assets/real-pet-images/ambree/ambree.png",   qr: "./assets/real-pet-images/ambree/qr-code-ambree.svg" },
  { name: "Bunny",   photo: "./assets/real-pet-images/bunny/bunny.png",     qr: "./assets/real-pet-images/bunny/qr-code-bunny.svg" },
  { name: "Dexter",  photo: "./assets/real-pet-images/dexter/dexter.png",   qr: "./assets/real-pet-images/dexter/qr-code-dexter.svg" },
  { name: "Drako",   photo: "./assets/real-pet-images/drako/drako.png",     qr: "./assets/real-pet-images/drako/qr-code-drako.svg" },
  { name: "Elmer",   photo: "./assets/real-pet-images/elmer/elmer.png",     qr: "./assets/real-pet-images/elmer/qr-code-elmer.svg" },
  { name: "Frazier", photo: "./assets/real-pet-images/frazier/frazier.png", qr: "./assets/real-pet-images/frazier/qr-code-frazier.svg" },
  { name: "Frida",   photo: "./assets/real-pet-images/frida/frida.png",     qr: "./assets/real-pet-images/frida/qr-code-frida.svg" },
  { name: "Hubert",  photo: "./assets/real-pet-images/hubert/hubert.png",   qr: "./assets/real-pet-images/hubert/qr-code-hubert.svg" },
  { name: "Jesse",   photo: "./assets/real-pet-images/jesse/jesse.png",     qr: "./assets/real-pet-images/jesse/qr-code-jesse.svg" },
  { name: "Journey", photo: "./assets/real-pet-images/journey/journey.png", qr: "./assets/real-pet-images/journey/qr-code-journey.svg" },
];

let activeToys = [];
let handSlots = [];
// let dog3d = null;
// domSlot (0-9) → petIndex: tracks which card positions are occupied
let cardSlotOccupied = {};

// Sound state
let lastPawStepMs = {};
let prevHandSlotCount = 0;

// ---------------------------------------------------------------------------
// DORMANT PET SYSTEM
// ---------------------------------------------------------------------------

const DORMANT_PET_COUNT = 10;
let dormantPets = []; // { x, y, petSheet, facingRight, activated, cardIndex }

function initDormantPets() {
  dormantPets = [];
  // Cluster all pets loosely around the center of the screen.
  // Each pet is placed at a random offset from center so they
  // overlap naturally without any grid structure.
  const cx = interfaceWidth / 2;
  const cy = interfaceHeight / 2 - 80; // slightly above center
  const spreadX = 700;  // horizontal scatter radius
  const spreadY = 340;  // vertical scatter radius (flatter cluster)

  for (let i = 0; i < DORMANT_PET_COUNT; i++) {
    // Use a roughly circular distribution with some randomness
    const angle = random(TWO_PI);
    const r = random(0.3, 1.0); // avoid stacking right at center
    const x = cx + cos(angle) * spreadX * r;
    const y = cy + sin(angle) * spreadY * r;
    const isCat = PET_IS_CAT[i] ?? false;
    const visualOptions = isCat ? PET_CAT_VISUAL_OPTIONS : PET_DOG_VISUAL_OPTIONS;
    const assignedSheet = PET_SHEET_ASSIGNMENT[i] ?? null;
    dormantPets.push({
      x,
      y,
      petSheet: assignedSheet ?? random(visualOptions),
      facingRight: random() > 0.5,
      activated: false,
      cardIndex: i,
    });
  }
}

function activateNextDormantPet() {
  const pet = dormantPets.find(p => !p.activated);
  if (pet) pet.activated = true;
  return pet ?? null;
}

// Reused every frame — avoids a per-frame object allocation inside drawDormantPets.
const _dormantFakeSprite = { velocity: { x: 0, y: 0 } };

function drawDormantPets() {
  // ONE push/pop + ONE tint for the whole batch instead of one per pet.
  // Uses drawingContext.save/restore (canvas-native, transform-only) for the
  // per-pet flip, which is far cheaper than p5's push/pop for each sprite.
  push();
  tint(180, 180, 180, 90);
  imageMode(CENTER);
  const frameIndex = floor(4 * ((millis() * 0.006) % 1)); // all dormant pets share same frame
  for (const pet of dormantPets) {
    if (pet.activated) continue;
    const sheet = pet.petSheet;
    if (!sheet?.idleImage) {
      noStroke(); fill(80, 255, 120);
      circle(pet.x, pet.y, 80);
      fill(20); textAlign(CENTER, CENTER); textSize(TEXT_FALLBACK_PET);
      text(sheet?.name ?? "pet", pet.x, pet.y + 1);
      continue;
    }
    const sourceX = frameIndex * spriteFrameSize;
    drawingContext.save();
    drawingContext.translate(pet.x, pet.y);
    if (!pet.facingRight) drawingContext.scale(-1, 1);
    image(sheet.idleImage, 0, 0, petRenderSize, petRenderSize, sourceX, 0, spriteFrameSize, spriteFrameSize);
    drawingContext.restore();
  }
  pop();
}

// Cached card slot center X values in interface coordinates.
// Populated once by cacheCardSlotPositions() after DOM is ready.
let cachedSlotCentersX = [];

// Pre-cached DOM element references for each card slot.
// Populated once by cacheCardElements() so revealPetCard() never calls
// querySelector() at reveal time (avoids a layout query spike mid-frame).
let cachedCardEls = []; // Array<{ card, wrapper, photo, qr, corner, bubble }>

const BUBBLE_SPOTS = [
  { left: 158, top: -98  },
  { left: 158, top: -60  },
  { left: -160, top: -98 },
  { left: -160, top: -60 },
  { left: 10,  top: -178 },
  { left: 55,  top: -178 },
];

function cacheCardSlotPositions() {
  // Computed from CSS constants — no DOM layout reads (offsetLeft etc.) needed.
  // Reading layout properties forces a synchronous layout which can stall the
  // main thread mid-frame; pure math is instant and equally accurate.
  cachedSlotCentersX = [];
  for (let i = 0; i < DORMANT_PET_COUNT; i++) {
    cachedSlotCentersX.push(cardCenterX(i));
  }
}

function cacheCardElements() {
  cachedCardEls = [];
  for (let i = 0; i < 10; i++) {
    const card    = document.getElementById('pet-card-' + i);
    const wrapper = card?.closest('.pet-card-wrapper');
    const photo   = card?.querySelector('.pet-photo')   ?? null;
    const qr      = card?.querySelector('.pet-qr')      ?? null;
    const corner  = wrapper?.querySelector('.pet-photo-corner') ?? null;
    const bubble  = wrapper?.querySelector('.find-me-bubble')   ?? null;

    // Pre-position the bubble (randomised once at startup, not at reveal time).
    // This avoids a layout-triggering style mutation during the busy reveal frame.
    if (bubble) {
      const s = BUBBLE_SPOTS[Math.floor(Math.random() * BUBBLE_SPOTS.length)];
      bubble.style.left = s.left + 'px';
      bubble.style.top  = s.top  + 'px';
      bubble.style.transformOrigin = s.left > 0 ? 'left center' : s.left < 0 ? 'right center' : 'center bottom';
    }

    cachedCardEls.push({ card, wrapper, photo, qr, corner, bubble });
  }
}

function getCardSlotCenterX(domSlot) {
  return cachedSlotCentersX[domSlot] ?? (domSlot + 0.5) * (interfaceWidth / 10);
}

// Finds the unoccupied card slot whose center is closest to handX (interface coords).
function findClosestAvailableSlot(handX) {
  let bestSlot = -1;
  let bestDist = Infinity;
  for (let i = 0; i < 10; i++) {
    if (cardSlotOccupied[i] !== undefined) continue;
    const dist = Math.abs(getCardSlotCenterX(i) - handX);
    if (dist < bestDist) { bestDist = dist; bestSlot = i; }
  }
  return bestSlot;
}

// Reveal the card slot nearest to handX and populate it with petIndex's images.
// Returns the domSlotIndex used (-1 if no slot available).
function revealPetCard(petIndex, handX) {
  const domSlot = findClosestAvailableSlot(handX);
  if (domSlot < 0) return -1;

  const pet  = PET_DATA[petIndex];
  const refs = cachedCardEls[domSlot];
  if (!refs?.card || !pet) return -1;

  cardSlotOccupied[domSlot] = petIndex;

  // All DOM writes are deferred to the next rAF so they don't stall the
  // p5 draw() tick that detected the pet arriving.
  // DOM refs are pre-cached — no querySelector() calls here.
  requestAnimationFrame(() => {
    const { card, photo, qr, corner } = refs;
    // Swap images (already decoded from preload); bubble position was
    // pre-randomised in cacheCardElements() so no layout writes needed here.
    if (photo) photo.src = pet.photo;
    if (qr)  { qr.src = pet.qr; qr.alt = 'Adopt ' + pet.name; }
    if (corner) corner.src = pet.photo;
    card.classList.add('revealed');
  });

  return domSlot;
}

function hidePetCard(domSlotIndex) {
  if (domSlotIndex < 0) return;
  const el = cachedCardEls[domSlotIndex]?.card ?? document.getElementById('pet-card-' + domSlotIndex);
  if (el) el.classList.remove('revealed');
  const petIndex = cardSlotOccupied[domSlotIndex];
  delete cardSlotOccupied[domSlotIndex];
  // Restore the dormant pet so it can be re-activated later
  if (petIndex !== undefined && petIndex >= 0 && petIndex < dormantPets.length) {
    dormantPets[petIndex].activated = false;
  }
}

function pickPetVisual() {
  return random(PET_SHEETS);
  // if (!dog3d) return random(PET_SHEETS);
  // const dogW = PET_DOG_VISUAL_OPTIONS.length;
  // const catW = PET_CAT_VISUAL_OPTIONS.length;
  // return random(dogW + catW) < dogW
  //   ? random(PET_DOG_VISUAL_OPTIONS)
  //   : random(PET_CAT_VISUAL_OPTIONS);
}

let modelReady = false;
const MAX_PEOPLE = 6;
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
const WRIST_LERP = 0.18; // smoothing factor: lower = smoother but laggier
const WRIST_MATCH_MAX_DISTANCE = 420;
// After initial lock-on, only re-match candidates within this radius
const WRIST_LOCK_DISTANCE = 220;
const WRIST_DETECTION_GRACE_MS = 450;

const TEXT_OVERLAY = 22;
const TEXT_WAITING = 26;
const TEXT_SPEECH_BUBBLE = 30;
const TEXT_FALLBACK_PET = 26;
const TEXT_DEBUG = 22;
const TEXT_CENTER_INSTRUCTION = 56;
const TEXT_SHELTER_LABEL = 52;
const CENTER_INSTRUCTION = "Hold Out Your Hand For A Surprise!";
const SHELTER_LABEL = "Animal Shelter";
const SPAWN_POINT = {
  x: interfaceWidth / 2,
  y: interfaceHeight / 2 - 140,
};

// ---------------------------------------------------------------------------
// SOUND EFFECTS — real MP3 files
// ---------------------------------------------------------------------------
// Create a /sounds folder next to your sketch and place these files in it:
//
//   sounds/bark.mp3  — dog bark
//     → pixabay.com/sound-effects/search/dog-bark
//
//   sounds/yip.mp3   — short puppy yip (plays when a new pet appears)
//     → pixabay.com/sound-effects/search/puppy-bark
//
//   sounds/meow.mp3  — cat meow
//     → pixabay.com/sound-effects/search/cat-meow
//
//   sounds/paw.mp3   — soft footstep / paw tap (plays while pet walks)
//     → pixabay.com/sound-effects/search/footstep
//
// All Pixabay sounds are royalty-free, no attribution required.
// Just click any result → green Download button → choose MP3.
// ---------------------------------------------------------------------------

// ── HTML Audio sound system ───────────────────────────────────────────────────

const SOUND_PATHS = {
  bark:   "./sounds/bark.mp3",
  bark2:  "./sounds/bark-2.mp3",
  bark3:  "./sounds/bark-3.mp3",
  yip:    "./sounds/yip.mp3",
  meow:   "./sounds/meow.mp3",
  paw:    "./sounds/paw.mp3",
};
const BARK_KEYS = ["bark", "bark2", "bark3"];

let audioMuted = false; // starts unmuted; press M to toggle

// Pool of reusable Audio elements keyed by sound name.
// Avoids creating a new Audio object (and triggering GC) on every paw step.
const _audioPools = {};
function _getPooledAudio(key) {
  const path = SOUND_PATHS[key];
  if (!path) return null;
  if (!_audioPools[key]) _audioPools[key] = [];
  const pool = _audioPools[key];
  for (const a of pool) {
    if (a.paused || a.ended) { a.currentTime = 0; return a; }
  }
  const a = new Audio(path);
  pool.push(a);
  return a;
}

function toggleSound() {
  audioMuted = !audioMuted;
  const btn = document.getElementById("sound-toggle");
  if (btn) {
    btn.textContent = audioMuted ? "🔇" : "🔊";
    btn.title = audioMuted ? "Enable sound" : "Mute sound";
  }
  // Play immediately inside this gesture so the browser allows future audio
    if (!audioMuted) {
      const key = BARK_KEYS[Math.floor(Math.random() * BARK_KEYS.length)];
      const a = _getPooledAudio(key);
      if (a) { a.volume = 0.6; a.play().catch(() => {}); }
    }
}

function setupSoundToggle() { /* button uses inline onclick="toggleSound()" */ }

function playSound(key, volume = 1.0) {
  if (audioMuted) return;
  const a = _getPooledAudio(key);
  if (!a) return;
  a.volume = Math.max(0, Math.min(1, volume));
  a.play().catch(() => {});
}

function preloadSounds() {
  // Prime one pooled element per sound so the first play never allocates
  for (const key of Object.keys(SOUND_PATHS)) _getPooledAudio(key);
}

function playDogYip(volume = 0.45)  { playSound("yip",  volume); }
function playCatMeow(volume = 0.5)  { playSound("meow", volume); }
function playPawStep(volume = 0.18) { playSound("paw",  volume); }


// ---------------------------------------------------------------------------
// PRELOAD / SETUP / DRAW
// ---------------------------------------------------------------------------

let dogTreatImage;

function preload() {
  const onImgError = (err) => console.warn("loadImage failed:", err);
  for (const sheet of PET_SHEETS) {
    if (!sheet.idleImage) sheet.idleImage = loadImage(sheet.idlePath, null, onImgError);
    if (!sheet.walkImage) sheet.walkImage = loadImage(sheet.walkPath, null, onImgError);
  }
  dogTreatImage = loadImage("./assets/dog-treat.png", null, onImgError);

  // Warm the browser image cache + trigger SVG rasterization at the
  // display size so setting .src at reveal time causes no stall.
  for (const pet of PET_DATA) {
    const img1 = new Image(130, 130); img1.src = pet.photo;
    const img2 = new Image(144, 144); img2.src = pet.qr;
    // Decode fully in the background — avoids lazy-decode on first paint
    img1.decode?.().catch(() => {});
    img2.decode?.().catch(() => {});
  }

  // loadDogViewer() disabled — 3D dog removed.
  // loadDogViewer();
}

function setup() {
  const canvas = createCanvas(interfaceWidth, interfaceHeight);
  canvas.parent("canvas-holder");
  applySavedScale();
  applyInterfaceScale();
  noSmooth();

  const canvasEl =
    canvas.elt || document.querySelector("#canvas-holder canvas");
  // const dogHolder = document.getElementById("dog-webgl-layer");
  // if (dogHolder && canvasEl && canvasEl.parentElement === dogHolder.parentElement) {
  //   canvasEl.parentElement.appendChild(dogHolder);
  // }
  if (canvasEl) canvasEl.style.backgroundColor = "transparent";
  clear();

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

  setupSoundToggle();
  initDormantPets();
  // Pre-warm canvas font metrics so the first speech bubble call never stalls.
  // Use the longest possible name to ensure all glyph widths are cached.
  push();
  textSize(TEXT_SPEECH_BUBBLE);
  textStyle(NORMAL);
  void textWidth("Hi, I'm Frazier!");
  void textAscent();
  void textDescent();
  pop();
  // Slot positions are pure math — compute immediately with no DOM dependency.
  cacheCardSlotPositions();
  // DOM element refs need the DOM to be ready; defer only cacheCardElements.
  setTimeout(cacheCardElements, 200);
  preloadSounds();

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

  drawDormantPets();
  syncHandsAndToys();
  if (DEBUG_POSE) drawPoseDebug();
  drawToyIfPresent();
  drawPetCardLines();
  updatePetBehavior();
  if (typeof drawSprites === "function") drawSprites();
  // if (dog3d) dog3d.update();
  drawWinkySpeechBubbleIfAtToy();
}

function windowResized() {
  applyInterfaceScale();
  // if (dog3d) dog3d.resize();
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
  if (key === "m" || key === "M") {
    toggleSound();
    return false;
  }
}

// ---------------------------------------------------------------------------
// BODY POSE SETUP
// ---------------------------------------------------------------------------

let rawPoses = [];
let lastStableToys = [];
let lastStableToysMs = 0;

function setupBodyPose() {
  setStatus("Loading body pose model...");

  poseModel = ml5.bodyPose(
    "MoveNet",
    {
      modelType: "MULTIPOSE_LIGHTNING",
      enableSmoothing: true,
      minPoseScore: MIN_PERSON_CONFIDENCE,
    },
    () => {
      modelReady = true;
      setStatus("Pose model loaded. Step into view and raise a hand!");
      poseModel.detectStart(video.elt, (results) => {
        rawPoses = results || [];
      });
    },
  );
}

// ---------------------------------------------------------------------------
// WRIST → TOY EXTRACTION
// ---------------------------------------------------------------------------

function wristToToy(kp) {
  if (!kp || kp.confidence < MIN_WRIST_CONFIDENCE) return null;
  const mapped = mapVideoToCanvas(kp.x, kp.y);
  return { x: mapped.x, y: mapped.y, d: 60 };
}

function buildActiveToys() {
  const toys = [];
  for (const pose of rawPoses) {
    if (pose.score !== undefined && pose.score < MIN_PERSON_CONFIDENCE)
      continue;

    const kps = pose.keypoints;
    if (!kps) continue;

    const leftWrist  = kps[KP_LEFT_WRIST];
    const rightWrist = kps[KP_RIGHT_WRIST];

    const lt = wristToToy(leftWrist);
    const rt = wristToToy(rightWrist);
    if (lt) toys.push(lt);
    if (rt) toys.push(rt);
  }
  return toys;
}

function matchCandidatesToSlots(candidates, slots) {
  const n = slots.length;
  const out = new Array(n).fill(null);
  if (n === 0 || candidates.length === 0) return out;

  const anchors = slots.map((s) => {
    const t = s.rawToy || s.toy;
    if (t) return { x: t.x, y: t.y };
    return {
      x: s.petSprite?.position?.x ?? SPAWN_POINT.x,
      y: s.petSprite?.position?.y ?? SPAWN_POINT.y,
    };
  });

  const pairs = [];
  for (let si = 0; si < n; si++) {
    for (let ci = 0; ci < candidates.length; ci++) {
      const c = candidates[ci];
      pairs.push({
        si,
        ci,
        d: dist(anchors[si].x, anchors[si].y, c.x, c.y),
      });
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const usedSlot = new Set();
  const usedCand = new Set();
  for (const { si, ci, d } of pairs) {
    if (usedSlot.has(si) || usedCand.has(ci)) continue;
    const hadPriorToy = !!(slots[si].rawToy || slots[si].toy);
    const maxD = slots[si].locked ? WRIST_LOCK_DISTANCE : WRIST_MATCH_MAX_DISTANCE;
    if (hadPriorToy && d > maxD) continue;
    usedSlot.add(si);
    usedCand.add(ci);
    out[si] = candidates[ci];
  }

  const leftoverCand = [];
  for (let ci = 0; ci < candidates.length; ci++) {
    if (!usedCand.has(ci)) leftoverCand.push(candidates[ci]);
  }
  for (let si = 0; si < n && leftoverCand.length; si++) {
    if (out[si]) continue;
    out[si] = leftoverCand.shift();
  }
  return out;
}

// ---------------------------------------------------------------------------
// HAND SLOT / TOY MANAGEMENT
// ---------------------------------------------------------------------------

function ensureHandSlots(n) {
  if (typeof createSprite === "function") {
    while (handSlots.length < n) {
      const dormant = activateNextDormantPet();
      const startX = dormant ? dormant.x : SPAWN_POINT.x;
      const startY = dormant ? dormant.y : SPAWN_POINT.y;
      const petSheet = dormant ? dormant.petSheet : pickPetVisual();

      const petSprite = createSprite(startX, startY, 44, 44);
      petSprite.maxSpeed = chaseSpeed;
      petSprite.friction = 0.05;
      // Hide p5.play's auto-drawn placeholder — we render the sprite sheet manually.
      if (typeof petSprite.visible !== "undefined") petSprite.visible = false;
      handSlots.push({
        petSprite,
        wasPetAtToy: false,
        toy: null,
        rawToy: null,
        toyMoveCandidateStartMs: 0,
        petSheet,
        facingRight: dormant ? dormant.facingRight : true,
        petDisplayName: dormant ? (PET_DISPLAY_NAMES[dormant.cardIndex] ?? "?") : "?",
        lastBarkMs: 0,
        cardIndex: dormant ? dormant.cardIndex : -1,   // identifies the pet
        domSlotIndex: -1,                               // which DOM card slot is showing
        cardRevealed: false,
        dormantRef: dormant,
        locked: false,
        _bubbleW: null, _bubbleH: null,                // cached speech-bubble dims
      });
    }
    while (handSlots.length > n) {
      const slot = handSlots.pop();
      if (slot.petSprite && typeof slot.petSprite.remove === "function")
        slot.petSprite.remove();
      if (slot.cardRevealed && slot.domSlotIndex >= 0) {
        if (slot.dormantRef) {
          slot.dormantRef.x = slot.petSprite.position.x;
          slot.dormantRef.y = slot.petSprite.position.y;
        }
        const domSlot = slot.domSlotIndex;
        setTimeout(() => hidePetCard(domSlot), 3000);
      } else if (slot.dormantRef) {
        slot.dormantRef.activated = false;
        slot.dormantRef.x = slot.petSprite.position.x;
        slot.dormantRef.y = slot.petSprite.position.y;
      }
    }
  } else {
    while (handSlots.length < n) {
      const dormant = activateNextDormantPet();
      const startX = dormant ? dormant.x : SPAWN_POINT.x;
      const startY = dormant ? dormant.y : SPAWN_POINT.y;
      handSlots.push({
        petSprite: { position: { x: startX, y: startY }, velocity: { x: 0, y: 0 } },
        wasPetAtToy: false,
        toy: null,
        rawToy: null,
        toyMoveCandidateStartMs: 0,
        petSheet: dormant ? dormant.petSheet : pickPetVisual(),
        facingRight: dormant ? dormant.facingRight : true,
        petDisplayName: dormant ? (PET_DISPLAY_NAMES[dormant.cardIndex] ?? "?") : "?",
        lastBarkMs: 0,
        cardIndex: dormant ? dormant.cardIndex : -1,
        domSlotIndex: -1,
        cardRevealed: false,
        dormantRef: dormant,
        locked: false,
        _bubbleW: null, _bubbleH: null,
      });
    }
    while (handSlots.length > n) {
      const slot = handSlots.pop();
      if (slot.cardRevealed && slot.domSlotIndex >= 0) {
        if (slot.dormantRef) {
          slot.dormantRef.x = slot.petSprite.position.x;
          slot.dormantRef.y = slot.petSprite.position.y;
        }
        const domSlot = slot.domSlotIndex;
        setTimeout(() => hidePetCard(domSlot), 3000);
      } else if (slot.dormantRef) {
        slot.dormantRef.activated = false;
        slot.dormantRef.x = slot.petSprite.position.x;
        slot.dormantRef.y = slot.petSprite.position.y;
      }
    }
  }
  // if (dog3d) dog3d.ensureSlotInstances(handSlots);
}


function syncHandsAndToys() {
  if (!modelReady) {
    ensureHandSlots(0);
    lastStableToys = [];
    return;
  }

  let freshToys = buildActiveToys();
  const now = millis();

  if (freshToys.length > 0) {
    lastStableToys = freshToys;
    lastStableToysMs = now;
  } else if (
    lastStableToys.length > 0 &&
    now - lastStableToysMs < WRIST_DETECTION_GRACE_MS
  ) {
    freshToys = lastStableToys;
  }

  activeToys = freshToys;

  if (activeToys.length === 0) {
    ensureHandSlots(0);
    lastStableToys = [];
    setStatus("Step into view and raise a hand!");
    return;
  }

  const prevCount = handSlots.length;
  ensureHandSlots(activeToys.length);

  const matched =
    prevCount === activeToys.length && prevCount > 0
      ? matchCandidatesToSlots(activeToys, handSlots)
      : activeToys.map((t) => t);

  for (let i = 0; i < activeToys.length; i++) {
    handSlots[i].rawToy = matched[i] ?? activeToys[i];
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
    push();
    imageMode(CENTER);
    if (dogTreatImage) {
      image(dogTreatImage, toy.x, toy.y, toy.d * 2.2, toy.d * 2.2);
    } else {
      noStroke();
      fill(236, 82, 82);
      circle(toy.x, toy.y, toy.d);
    }
    pop();
  }
}

function updatePetBehavior() {
  if (handSlots.length === 0) return;

  // Play a sound for each newly added hand slot
  if (handSlots.length > prevHandSlotCount) {
    for (let ni = prevHandSlotCount; ni < handSlots.length; ni++) {
      const isCat = handSlots[ni].petSheet?.name?.startsWith("cat");
      if (isCat) {
        playCatMeow(0.5);
      } else {
        const dogSounds = ["yip", ...BARK_KEYS];
        playSound(dogSounds[Math.floor(Math.random() * dogSounds.length)], 0.5);
      }
    }
  }
  prevHandSlotCount = handSlots.length;

  for (let si = 0; si < handSlots.length; si++) {
    const slot = handSlots[si];
    const petSprite = slot.petSprite;
    const rawToy = slot.rawToy;

    if (!rawToy) {
      slot.smoothedToy = null;
      slot.toy = null;
      slot.toyMoveCandidateStartMs = 0;
      petSprite.velocity.x *= 0.9;
      petSprite.velocity.y *= 0.9;
      slot.wasPetAtToy = false;
      continue;
    }

    // Lock onto this hand — prevents re-assigning to a different person's hand
    slot.locked = true;

    // Lerp the raw wrist position to remove per-frame jitter
    if (!slot.smoothedToy) {
      slot.smoothedToy = { x: rawToy.x, y: rawToy.y, d: rawToy.d };
    } else {
      slot.smoothedToy.x += (rawToy.x - slot.smoothedToy.x) * WRIST_LERP;
      slot.smoothedToy.y += (rawToy.y - slot.smoothedToy.y) * WRIST_LERP;
    }
    const smoothed = slot.smoothedToy;

    if (!slot.toy) {
      slot.toy = { ...smoothed };
      slot.toyMoveCandidateStartMs = 0;
    } else {
      // Squared-distance comparisons avoid two Math.sqrt calls per frame.
      const _pdx = petSprite.position.x - slot.toy.x;
      const _pdy = petSprite.position.y - slot.toy.y;
      const petIsNearLatchedToy = (_pdx * _pdx + _pdy * _pdy) <=
        PET_NEAR_TOY_LOCK_RADIUS * PET_NEAR_TOY_LOCK_RADIUS;
      const _hmdx = smoothed.x - slot.toy.x;
      const _hmdy = smoothed.y - slot.toy.y;
      const handHasMoved = (_hmdx * _hmdx + _hmdy * _hmdy) >=
        HAND_MOVE_RETARGET_DISTANCE * HAND_MOVE_RETARGET_DISTANCE;

      if (!petIsNearLatchedToy) {
        slot.toy = { ...smoothed };
        slot.toyMoveCandidateStartMs = 0;
      } else if (handHasMoved) {
        if (!slot.toyMoveCandidateStartMs) {
          slot.toyMoveCandidateStartMs = millis();
        }
        if (millis() - slot.toyMoveCandidateStartMs >= HAND_MOVE_RETARGET_DELAY_MS) {
          slot.toy = { ...smoothed };
          slot.toyMoveCandidateStartMs = 0;
        }
      } else {
        slot.toyMoveCandidateStartMs = 0;
      }
    }

    const toy = slot.toy;
    // Plain math instead of createVector() — avoids a p5.Vector allocation every frame.
    const _dx = toy.x - petSprite.position.x;
    const _dy = toy.y - petSprite.position.y;
    const distanceToToy = Math.hypot(_dx, _dy);
    const atToy = distanceToToy <= TOY_REACH_DISTANCE;
    const isCat = slot.petSheet?.name?.startsWith("cat");

    slot.wasPetAtToy = atToy;

    // First time the pet reaches its hand → reveal the nearest available card slot
    if (atToy && !slot.cardRevealed && slot.cardIndex >= 0) {
      slot.cardRevealed = true;
      slot.domSlotIndex = revealPetCard(slot.cardIndex, slot.toy.x);
    }

    if (distanceToToy > TOY_REACH_DISTANCE) {
      const _scale = chaseSpeed / distanceToToy;
      petSprite.velocity.x = _dx * _scale;
      petSprite.velocity.y = _dy * _scale;
      if (_dx > 0.1) slot.facingRight = true;
      else if (_dx < -0.1) slot.facingRight = false;

      // Paw-step sounds while running, rhythm scales with speed
      const speed = Math.hypot(petSprite.velocity.x, petSprite.velocity.y);
      if (speed > walkFrameThreshold) {
        if (!lastPawStepMs[si]) lastPawStepMs[si] = 0;
        const stepInterval = map(speed, 1, chaseSpeed, 380, 160);
        if (millis() - lastPawStepMs[si] > stepInterval) {
          lastPawStepMs[si] = millis();
          playPawStep();
        }
      }
    } else {
      // Hard stop at target — avoids micro-jitter from residual velocity
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
  // if (slot.petSheet?.kind === "3d") return;
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
  // if (sheet?.kind === "3d") return;
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
  const _dx = slot.petSprite.position.x - slot.toy.x;
  const _dy = slot.petSprite.position.y - slot.toy.y;
  return _dx * _dx + _dy * _dy <=
    SPEECH_BUBBLE_REACH_DISTANCE * SPEECH_BUBBLE_REACH_DISTANCE;
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
  // Use cached dimensions to avoid per-frame textWidth() / textAscent() calls
  if (!slot._bubbleW) {
    slot._bubbleW = textWidth(bubbleText) + padX * 2;
    slot._bubbleH = max(52, textAscent() + textDescent() + padY * 2);
  }
  const bubbleW = slot._bubbleW;
  const bubbleH = slot._bubbleH;
  // const is3d = slot.petSheet?.kind === "3d";
  const lift = 118; // was: is3d ? 220 : 118
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

// Card layout constants (must match index.html CSS)
const CARD_W = 180;
const CARD_GAP = 32;
const CARD_PAD = 60;
const CARD_H = 180;
const CARD_PEEK = 54; // how many px the image pokes above the outer card

function cardCenterX(cardIndex) {
  const totalW = DORMANT_PET_COUNT * CARD_W + (DORMANT_PET_COUNT - 1) * CARD_GAP;
  const leftEdge = CARD_PAD + (interfaceWidth - 2 * CARD_PAD - totalW) / 2;
  return leftEdge + cardIndex * (CARD_W + CARD_GAP) + CARD_W / 2;
}

function drawPetCardLines() {
  for (const slot of handSlots) {
    if (!slot.cardRevealed || slot.domSlotIndex < 0) continue;

    const cx = getCardSlotCenterX(slot.domSlotIndex);
    // Anchor inside the card — the HTML card (z-index 5) sits on top of the
    // canvas (z-index 3), so this end of the line is hidden behind the card,
    // making it look like the string is attached to it.
    const cardTopY = interfaceHeight - CARD_H * 0.35;

    const px = slot.petSprite.position.x;
    // Anchor at the pet's lower body (collar area) so the sprite covers the line end
    const py = slot.petSprite.position.y + petRenderSize * 0.15;

    push();
    stroke(210, 50, 50, 200);
    strokeWeight(4);
    strokeCap(ROUND);
    line(cx, cardTopY, px, py);
    pop();
  }
}


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
// 3-D DOG LOADER — disabled
// ---------------------------------------------------------------------------

// async function loadDogViewer() {
//   const holder = document.getElementById("dog-webgl-layer");
//   if (!holder) return;
//   try {
//     const THREE = await import("three");
//     const { GLTFLoader } =
//       await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js");
//     const { clone: cloneSkinnedModel } =
//       await import("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js");
//
//     const scene = new THREE.Scene();
//     const halfW = interfaceWidth / 2, halfH = interfaceHeight / 2;
//     const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 500);
//     camera.position.set(0, 0, 100);
//     camera.lookAt(0, 0, 0);
//
//     const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
//     renderer.setClearColor(0x000000, 0);
//     renderer.shadowMap.enabled = false;
//     renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
//     renderer.setSize(interfaceWidth, interfaceHeight);
//     if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
//     holder.appendChild(renderer.domElement);
//
//     scene.add(new THREE.AmbientLight(0xffffff, 0.55));
//     const key = new THREE.DirectionalLight(0xffffff, 0.95);
//     key.position.set(4, 14, 10);
//     scene.add(key);
//     const fill = new THREE.DirectionalLight(0xb8c8ff, 0.35);
//     fill.position.set(-8, 6, -6);
//     scene.add(fill);
//
//     const loader = new GLTFLoader();
//     const gltf = await new Promise((resolve, reject) =>
//       loader.load("./stylized_dog_low_poly/scene.gltf", resolve, undefined, reject),
//     );
//
//     const templateModel = gltf.scene;
//     templateModel.updateMatrixWorld(true);
//     const size0 = new THREE.Vector3();
//     new THREE.Box3().setFromObject(templateModel).getSize(size0);
//     const fitScale = 160 / Math.max(size0.y, 1e-4);
//     templateModel.scale.setScalar(fitScale);
//     templateModel.updateMatrixWorld(true);
//     const bT = new THREE.Box3().setFromObject(templateModel);
//     templateModel.position.x -= (bT.min.x + bT.max.x) / 2;
//     templateModel.position.y -= bT.min.y;
//     templateModel.position.z -= (bT.min.z + bT.max.z) / 2;
//     templateModel.rotation.y = THREE.MathUtils.degToRad(-45);
//
//     templateModel.traverse((child) => {
//       if (!child.isMesh) return;
//       child.castShadow = false;
//       child.receiveShadow = false;
//       const mats = Array.isArray(child.material) ? child.material : [child.material];
//       for (const mat of mats) {
//         if (!mat) continue;
//         if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
//           mat.metalness = 0; mat.roughness = 1;
//           if ("envMapIntensity" in mat) mat.envMapIntensity = 0;
//           if (mat.map) {
//             mat.emissiveMap = mat.map; mat.emissive.set(1,1,1);
//             mat.emissiveIntensity = 1; mat.color.set(0,0,0);
//           } else {
//             mat.emissive.copy(mat.color); mat.emissiveIntensity = 1; mat.color.set(0,0,0);
//           }
//           mat.needsUpdate = true;
//         } else if (mat.emissive && mat.color) {
//           mat.emissive.copy(mat.color); mat.emissiveIntensity = 1;
//         }
//       }
//     });
//
//     const clips = gltf.animations || [];
//     const idleClip = THREE.AnimationClip.findByName(clips, "idle");
//     const walkClip = THREE.AnimationClip.findByName(clips, "walk");
//     const slotInstances = [];
//     const clock = new THREE.Clock();
//     const moveSpeedThreshold = 0.32, fadeSec = 0.24;
//
//     function syncWalkIdleForInstance(inst, speed) {
//       const wantWalk = speed > moveSpeedThreshold;
//       if (wantWalk === inst.animIsWalk) return;
//       inst.animIsWalk = wantWalk;
//       const { idleAction, walkAction } = inst;
//       if (idleAction && walkAction) {
//         if (wantWalk) { idleAction.fadeOut(fadeSec); walkAction.reset().fadeIn(fadeSec).play(); }
//         else { walkAction.fadeOut(fadeSec); idleAction.reset().fadeIn(fadeSec).play(); }
//       } else if (idleAction && !wantWalk) { idleAction.reset().fadeIn(0.1).play(); }
//       else if (walkAction && wantWalk) { walkAction.reset().fadeIn(0.1).play(); }
//     }
//
//     function addDogInstance() {
//       const cloned = cloneSkinnedModel(templateModel);
//       const petRoot = new THREE.Group();
//       scene.add(petRoot);
//       petRoot.add(cloned);
//       const mixer = new THREE.AnimationMixer(cloned);
//       const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
//       const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
//       if (idleAction) { idleAction.loop = THREE.LoopRepeat; idleAction.play(); }
//       if (walkAction) { walkAction.loop = THREE.LoopRepeat; walkAction.stop(); }
//       return { petRoot, model: cloned, mixer, idleAction, walkAction, animIsWalk: false, facingX: 1 };
//     }
//
//     function removeDogInstance(inst) {
//       if (!inst) return;
//       inst.mixer.stopAllAction();
//       scene.remove(inst.petRoot);
//     }
//
//     dog3d = {
//       ensureSlotInstances(slots) {
//         while (slotInstances.length > slots.length) removeDogInstance(slotInstances.pop());
//         while (slotInstances.length < slots.length) slotInstances.push(null);
//         for (let i = 0; i < slots.length; i++) {
//           const want3d = slots[i].petSheet?.kind === "3d";
//           if (want3d && !slotInstances[i]) slotInstances[i] = addDogInstance();
//           else if (!want3d && slotInstances[i]) { removeDogInstance(slotInstances[i]); slotInstances[i] = null; }
//         }
//       },
//       update() {
//         const dt = Math.min(clock.getDelta(), 0.1);
//         for (let i = 0; i < handSlots.length; i++) {
//           const inst = slotInstances[i];
//           if (!inst) continue;
//           const slot = handSlots[i];
//           if (!slot?.petSprite) continue;
//           inst.mixer.update(dt);
//           const { velocity: { x: vx, y: vy }, position: { x: px, y: py } } = slot.petSprite;
//           syncWalkIdleForInstance(inst, Math.hypot(vx, vy));
//           if (vx > 0.08) inst.facingX = -1; else if (vx < -0.08) inst.facingX = 1;
//           inst.petRoot.scale.set(inst.facingX, 1, 1);
//           inst.petRoot.position.set(px - interfaceWidth / 2, -(py - interfaceHeight / 2), 0);
//         }
//         renderer.render(scene, camera);
//       },
//       resize() {
//         const hw = interfaceWidth / 2, hh = interfaceHeight / 2;
//         camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
//         camera.updateProjectionMatrix();
//         renderer.setSize(interfaceWidth, interfaceHeight);
//       },
//     };
//   } catch (err) {
//     console.warn("3D dog failed to load, sprite pets only.", err);
//     dog3d = null;
//     setStatus("3D dog failed to load — sprite pets only. See browser console for details.");
//   }
// }

let _lastStatus = "";
function setStatus(message) {
  if (message === _lastStatus) return;
  _lastStatus = message;
  const el = document.getElementById("status");
  if (el) el.textContent = message;
}