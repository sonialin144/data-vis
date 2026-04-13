let video;
let handposeModel;
let predictions = [];

const PET_SHEETS = [
  { name: "dog-1", idlePath: "./assets/1 Dog/Idle.png", walkPath: "./assets/1 Dog/Walk.png" },
  { name: "dog-2", idlePath: "./assets/2 Dog 2/Idle.png", walkPath: "./assets/2 Dog 2/Walk.png" },
  { name: "cat-1", idlePath: "./assets/3 Cat/Idle.png", walkPath: "./assets/3 Cat/Walk.png" },
  { name: "cat-2", idlePath: "./assets/4 Cat 2/Idle.png", walkPath: "./assets/4 Cat 2/Walk.png" },
];

/** Randomized low-poly GLTF dog (Three.js layer); not a sprite sheet. */
const PET_3D = { name: "dog-3d", kind: "3d" };

/** Dog visuals: two sprite dogs + 3D dog, each equally likely when a dog is chosen. */
const PET_DOG_VISUAL_OPTIONS = [PET_SHEETS[0], PET_SHEETS[1], PET_3D];
const PET_CAT_VISUAL_OPTIONS = [PET_SHEETS[2], PET_SHEETS[3]];

/** Shown in the speech bubble when a pet reaches its toy (one name per spawned pet). */
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
 * One slot per tracked hand: pet + that hand's toy. Index matches filtered hands.
 * @type {Array<{ petSprite: any; wasPetAtToy: boolean; toy: { x: number; y: number; d: number } | null; petSheet: (typeof PET_DOG_VISUAL_OPTIONS)[number] | (typeof PET_CAT_VISUAL_OPTIONS)[number]; facingRight: boolean; petDisplayName: string }>}
 */
let handSlots = [];

/** @type {{ update: () => void; resize: () => void; ensureSlotInstances: (slots: typeof handSlots) => void } | null} */
let dog3d = null;

function pickPetVisual() {
  if (!dog3d) {
    return random(PET_SHEETS);
  }
  // 3 dog variants vs 2 cats → 3:2 split so each of the five visuals is 20%
  // (dog-1, dog-2, and 3D dog are equally likely, same as each other).
  const dogW = PET_DOG_VISUAL_OPTIONS.length;
  const catW = PET_CAT_VISUAL_OPTIONS.length;
  if (random(dogW + catW) < dogW) {
    return random(PET_DOG_VISUAL_OPTIONS);
  }
  return random(PET_CAT_VISUAL_OPTIONS);
}

let modelReady = false;
/** Upper bound passed to ml5 handPose (each hand → ball + dog). */
const MAX_HANDS = 10;
const interfaceWidth = 3072;
const interfaceHeight = 1280;
const scaleStorageKey = "handposePrototypeInterfaceScale";
const scaleStep = 0.05;
const minInterfaceScale = 0.2;
const maxInterfaceScale = 2.5;
let interfaceScale = 1;
const chaseSpeed = 4;
const petRenderSize = 288;
const spriteFrameSize = 48;
const walkFrameThreshold = 0.25;
const DEBUG_HAND = false;
/** When pet is this close to the toy (px), the greeting bubble appears. */
const SPEECH_BUBBLE_REACH_DISTANCE = 48;
/** Same as chase slowdown: pet is considered to have reached the toy (px). */
const TOY_REACH_DISTANCE = 8;

const TEXT_OVERLAY = 22;
const TEXT_WAITING = 26;
const TEXT_SPEECH_BUBBLE = 30;
const TEXT_FALLBACK_PET = 26;
const TEXT_DEBUG = 22;

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
  const canvasEl = canvas.elt || document.querySelector("#canvas-holder canvas");
  const dogHolder = document.getElementById("dog-webgl-layer");
  if (dogHolder && canvasEl && canvasEl.parentElement === dogHolder.parentElement) {
    canvasEl.parentElement.appendChild(dogHolder);
  }
  if (canvasEl) {
    canvasEl.style.backgroundColor = "transparent";
  }
  clear();

  if (!window.isSecureContext) {
    setStatus("Camera needs localhost or HTTPS. Open via a local server.");
  }

  video = createCapture(
    {
      video: { facingMode: "user" },
      audio: false,
    },
    () => {
      setStatus("Webcam stream received. Preparing video...");
    },
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
    video.elt
      .play()
      .then(() => setStatus("Webcam ready. Loading handpose model..."))
      .catch(() => setStatus("Camera blocked. Allow permission and reload."));
  };
  video.elt.onerror = () => {
    setStatus("Could not access webcam. Check browser permission settings.");
  };
  setupHandpose();
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
  if (DEBUG_HAND) {
    drawHandDebug();
  }
  drawToyIfPresent();
  updatePetBehavior();
  if (typeof drawSprites === "function") {
    drawSprites();
  }
  if (dog3d) {
    dog3d.update();
  }

  drawWinkySpeechBubbleIfAtToy();

  drawOverlayText();
}

function windowResized() {
  applyInterfaceScale();
  if (dog3d) {
    dog3d.resize();
  }
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

function setupHandpose() {
  setStatus("Loading hand pose model...");
  handposeModel = ml5.handPose(
    {
      maxHands: MAX_HANDS,
      runtime: "tfjs",
      modelType: "full",
      flipHorizontal: false,
    },
    () => {
      modelReady = true;
      setStatus("Model loaded. Show your hand.");
      handposeModel.detectStart(video.elt, (results) => {
        predictions = results;
      });
    },
  );
}

function ensureHandSlots(n) {
  if (typeof createSprite === "function") {
    while (handSlots.length < n) {
      const petSprite = createSprite(
        random(80, width - 80),
        random(80, height - 80),
        44,
        44,
      );
      petSprite.maxSpeed = chaseSpeed;
      petSprite.friction = 0.05;
      const petSheet = pickPetVisual();
      if (dog3d && petSheet?.kind === "3d" && typeof petSprite.visible !== "undefined") {
        petSprite.visible = false;
      }
      handSlots.push({
        petSprite,
        wasPetAtToy: false,
        toy: null,
        petSheet,
        facingRight: true,
        petDisplayName: random(PET_DISPLAY_NAMES),
      });
    }
    while (handSlots.length > n) {
      const slot = handSlots.pop();
      if (slot.petSprite && typeof slot.petSprite.remove === "function") {
        slot.petSprite.remove();
      }
    }
  } else {
    while (handSlots.length < n) {
      handSlots.push({
        petSprite: {
          position: {
            x: random(80, width - 80),
            y: random(80, height - 80),
          },
          velocity: { x: 0, y: 0 },
        },
        wasPetAtToy: false,
        toy: null,
        petSheet: pickPetVisual(),
        facingRight: true,
        petDisplayName: random(PET_DISPLAY_NAMES),
      });
    }
    while (handSlots.length > n) {
      handSlots.pop();
    }
  }
  if (dog3d) {
    dog3d.ensureSlotInstances(handSlots);
  }
}

function toyFromHand(hand) {
  if (!hand) {
    return null;
  }

  if (hand.keypoints && hand.keypoints.length > 0) {
    const kp = hand.keypoints;
    const layout = getVideoLayout();
    const wrist = kp[0];
    if (!wrist) {
      return null;
    }
    if (kp.length >= 18) {
      const indexMcp = kp[5];
      const middleMcp = kp[9];
      const ringMcp = kp[13];
      const pinkyMcp = kp[17];
      if (indexMcp && middleMcp && ringMcp && pinkyMcp) {
        const palmX =
          (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5;
        const palmY =
          (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5;
        const handWidth = dist(indexMcp.x, indexMcp.y, pinkyMcp.x, pinkyMcp.y);
        const mappedPalm = mapVideoToCanvas(palmX, palmY);
        const scaledHandWidth = handWidth * layout.scale;
        const d = constrain(scaledHandWidth * 2, 24, 260);
        return { x: mappedPalm.x, y: mappedPalm.y, d };
      }
    }
    const mapped = mapVideoToCanvas(wrist.x, wrist.y);
    return { x: mapped.x, y: mapped.y, d: 52 };
  }

  if (hand.landmarks && hand.landmarks.length >= 18) {
    const landmarks = hand.landmarks;
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];
    if (!wrist || !indexMcp || !middleMcp || !ringMcp || !pinkyMcp) {
      return null;
    }
    const palmX =
      (wrist[0] + indexMcp[0] + middleMcp[0] + ringMcp[0] + pinkyMcp[0]) / 5;
    const palmY =
      (wrist[1] + indexMcp[1] + middleMcp[1] + ringMcp[1] + pinkyMcp[1]) / 5;
    const handWidth = dist(indexMcp[0], indexMcp[1], pinkyMcp[0], pinkyMcp[1]);
    const mappedPalm = mapVideoToCanvas(palmX, palmY);
    const layout = getVideoLayout();
    const scaledHandWidth = handWidth * layout.scale;
    const d = constrain(scaledHandWidth * 2, 24, 260);
    return { x: mappedPalm.x, y: mappedPalm.y, d };
  }

  return null;
}

function syncHandsAndToys() {
  if (!modelReady) {
    ensureHandSlots(0);
    return;
  }
  if (!predictions || predictions.length === 0) {
    ensureHandSlots(0);
    setStatus("Show your hand.");
    return;
  }

  const n = predictions.length;
  ensureHandSlots(n);
  for (let i = 0; i < n; i += 1) {
    handSlots[i].toy = toyFromHand(predictions[i]);
  }

  if (n === 1) {
    setStatus("Toy attached. Pet is running to you.");
  } else {
    setStatus(`${n} hands — ${n} toys and pets.`);
  }
}

function drawToyIfPresent() {
  for (const slot of handSlots) {
    const toy = slot.toy;
    if (!toy) {
      continue;
    }
    noStroke();
    fill(236, 82, 82);
    circle(toy.x, toy.y, toy.d);
    fill(255, 170, 170, 220);
    circle(toy.x - toy.d * 0.18, toy.y - toy.d * 0.18, toy.d * 0.3);
  }
}

function updatePetBehavior() {
  if (handSlots.length === 0) {
    return;
  }

  for (let si = 0; si < handSlots.length; si += 1) {
    const slot = handSlots[si];
    const petSprite = slot.petSprite;
    const toy = slot.toy;

    if (!toy) {
      petSprite.velocity.x *= 0.9;
      petSprite.velocity.y *= 0.9;
      slot.wasPetAtToy = false;
      continue;
    }

    const dir = createVector(toy.x - petSprite.position.x, toy.y - petSprite.position.y);
    const distanceToToy = dir.mag();

    const atToy = distanceToToy <= TOY_REACH_DISTANCE;
    if (atToy && !slot.wasPetAtToy) {
      console.log("[pet] Reached toy", {
        handSlot: si,
        distancePx: Math.round(distanceToToy * 10) / 10,
        pet: { x: petSprite.position.x, y: petSprite.position.y },
        toy: { x: toy.x, y: toy.y },
      });
    }
    slot.wasPetAtToy = atToy;

    if (distanceToToy > TOY_REACH_DISTANCE) {
      dir.normalize().mult(chaseSpeed);
      petSprite.velocity.x = dir.x;
      petSprite.velocity.y = dir.y;
      if (abs(dir.x) > 0.05) {
        slot.facingRight = dir.x > 0;
      }
    } else {
      petSprite.velocity.x *= 0.8;
      petSprite.velocity.y *= 0.8;
    }
  }

  if (typeof drawSprites !== "function") {
    for (const slot of handSlots) {
      const petSprite = slot.petSprite;
      petSprite.position.x += petSprite.velocity.x;
      petSprite.position.y += petSprite.velocity.y;
      petSprite.position.x = constrain(petSprite.position.x, 20, width - 20);
      petSprite.position.y = constrain(petSprite.position.y, 20, height - 20);
    }
  }

  for (const slot of handSlots) {
    drawPetSpriteShapeAt(slot);
  }
}

function drawPetSpriteShapeAt(slot) {
  if (slot.petSheet?.kind === "3d") {
    return;
  }
  const petSprite = slot.petSprite;
  const sheet = slot.petSheet;
  push();
  drawAnimatedPetSprite(
    petSprite.position.x,
    petSprite.position.y,
    petRenderSize,
    slot.facingRight,
    petSprite,
    sheet,
  );
  pop();
}

function drawAnimatedPetSprite(centerX, centerY, renderSize, facingRight, petSprite, sheet) {
  if (sheet?.kind === "3d") {
    return;
  }
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

  const speed = sqrt(
    petSprite.velocity.x * petSprite.velocity.x + petSprite.velocity.y * petSprite.velocity.y,
  );
  const isWalking = speed > walkFrameThreshold;
  const spriteSheet = isWalking ? sheet.walkImage : sheet.idleImage;
  const frameCount = isWalking ? 6 : 4;
  const frameIndex = floor(frameCount === 0 ? 0 : frameCount * ((millis() * 0.006) % 1));
  const sourceX = frameIndex * spriteFrameSize;

  imageMode(CENTER);
  translate(centerX, centerY);
  if (!facingRight) {
    scale(-1, 1);
  }
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
  if (!slot.toy || !slot.petSprite) {
    return false;
  }
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
    if (!slotIsCloseToToy(slot)) {
      continue;
    }
    drawWinkySpeechBubbleForPet(slot);
  }
}

function drawWinkySpeechBubbleForPet(slot) {
  const petSprite = slot.petSprite;
  const bubbleText = petBubbleLine(slot);
  push();
  const px = petSprite.position.x;
  const py = petSprite.position.y;
  textSize(TEXT_SPEECH_BUBBLE);
  textStyle(NORMAL);
  const padX = 24;
  const padY = 14;
  const tw = textWidth(bubbleText);
  const bubbleW = tw + padX * 2;
  const bubbleH = max(52, textAscent() + textDescent() + padY * 2);
  const lift = 118;
  const bubbleCx = constrain(px, bubbleW / 2 + 10, width - bubbleW / 2 - 10);
  const bubbleCy = py - lift;
  const bubbleTop = bubbleCy - bubbleH / 2;
  const bubbleBottom = bubbleCy + bubbleH / 2;

  noStroke();
  fill(255, 255, 255, 245);
  rectMode(CENTER);
  rect(bubbleCx, bubbleCy, bubbleW, bubbleH, 16, 16, 16, 16);

  stroke(45, 45, 55, 200);
  strokeWeight(2);
  noFill();
  rect(bubbleCx, bubbleCy, bubbleW, bubbleH, 16, 16, 16, 16);

  const tailW = 22;
  const tailMidX = constrain(px, bubbleCx - bubbleW / 2 + 24, bubbleCx + bubbleW / 2 - 24);
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
        ? handSlots[0].petSheet?.name ?? "pet"
        : `${n} pets`;
  text(`Pet: ${label}`, 12, 10);
}

function drawHandDebug() {
  if (!modelReady) {
    return;
  }

  if (!predictions || predictions.length === 0) {
    fill(255, 120, 120);
    textSize(TEXT_DEBUG);
    textAlign(LEFT, TOP);
    text("No hand detected", 12, 36);
    return;
  }

  for (let hi = 0; hi < predictions.length; hi += 1) {
    const hand = predictions[hi];
    const keypoints = hand.keypoints;
    const landmarks = hand.landmarks;

    noStroke();
    fill(80, 255, 170);
    if (keypoints && keypoints.length > 0) {
      for (const pt of keypoints) {
        const mapped = mapVideoToCanvas(pt.x, pt.y);
        circle(mapped.x, mapped.y, 7);
      }
      const wrist = keypoints[0];
      const indexMcp = keypoints[5];
      const middleMcp = keypoints[9];
      const ringMcp = keypoints[13];
      const pinkyMcp = keypoints[17];
      if (wrist && indexMcp && middleMcp && ringMcp && pinkyMcp) {
        const palmX =
          (wrist.x + indexMcp.x + middleMcp.x + ringMcp.x + pinkyMcp.x) / 5;
        const palmY =
          (wrist.y + indexMcp.y + middleMcp.y + ringMcp.y + pinkyMcp.y) / 5;
        const mappedPalm = mapVideoToCanvas(palmX, palmY);
        fill(255, 235, 80);
        circle(mappedPalm.x, mappedPalm.y, 14);
      }
    } else if (landmarks && landmarks.length > 0) {
      for (const lm of landmarks) {
        const mapped = mapVideoToCanvas(lm[0], lm[1]);
        circle(mapped.x, mapped.y, 7);
      }
      const wrist = landmarks[0];
      const indexMcp = landmarks[5];
      const middleMcp = landmarks[9];
      const ringMcp = landmarks[13];
      const pinkyMcp = landmarks[17];
      if (wrist && indexMcp && middleMcp && ringMcp && pinkyMcp) {
        const palmX =
          (wrist[0] + indexMcp[0] + middleMcp[0] + ringMcp[0] + pinkyMcp[0]) / 5;
        const palmY =
          (wrist[1] + indexMcp[1] + middleMcp[1] + ringMcp[1] + pinkyMcp[1]) / 5;
        const mappedPalm = mapVideoToCanvas(palmX, palmY);
        fill(255, 235, 80);
        circle(mappedPalm.x, mappedPalm.y, 14);
      }
    }

    if (
      hand.boundingBox &&
      hand.boundingBox.topLeft &&
      hand.boundingBox.bottomRight
    ) {
      const topLeft = hand.boundingBox.topLeft;
      const bottomRight = hand.boundingBox.bottomRight;
      const tlX = Array.isArray(topLeft) ? topLeft[0] : topLeft.x;
      const tlY = Array.isArray(topLeft) ? topLeft[1] : topLeft.y;
      const brX = Array.isArray(bottomRight) ? bottomRight[0] : bottomRight.x;
      const brY = Array.isArray(bottomRight) ? bottomRight[1] : bottomRight.y;
      const mappedTopLeft = mapVideoToCanvas(tlX, tlY);
      const mappedBottomRight = mapVideoToCanvas(brX, brY);
      const x = min(mappedTopLeft.x, mappedBottomRight.x);
      const y = min(mappedTopLeft.y, mappedBottomRight.y);
      const w = abs(mappedBottomRight.x - mappedTopLeft.x);
      const h = abs(mappedBottomRight.y - mappedTopLeft.y);
      noFill();
      stroke(80, 180, 255);
      strokeWeight(2);
      rect(x, y, w, h);
    }
  }
}

function getVideoLayout() {
  const vw = video && video.elt ? video.elt.videoWidth || width : width;
  const vh = video && video.elt ? video.elt.videoHeight || height : height;
  // Match CSS: object-fit: cover (fills viewport by cropping overflow).
  const scale = max(width / vw, height / vh);
  const displayW = vw * scale;
  const displayH = vh * scale;
  const offsetX = (width - displayW) / 2;
  const offsetY = (height - displayH) / 2;
  return { vw, vh, scale, offsetX, offsetY };
}

function mapVideoToCanvas(videoX, videoY) {
  const layout = getVideoLayout();
  const normalizedX = 1 - videoX / layout.vw;
  const normalizedY = videoY / layout.vh;
  return {
    x: layout.offsetX + normalizedX * (layout.vw * layout.scale),
    y: layout.offsetY + normalizedY * (layout.vh * layout.scale),
  };
}

function applySavedScale() {
  const savedScaleRaw = window.localStorage.getItem(scaleStorageKey);
  if (!savedScaleRaw) {
    return;
  }
  const parsedScale = Number.parseFloat(savedScaleRaw);
  if (Number.isFinite(parsedScale)) {
    interfaceScale = constrain(parsedScale, minInterfaceScale, maxInterfaceScale);
  }
}

function setInterfaceScale(nextScale) {
  interfaceScale = constrain(nextScale, minInterfaceScale, maxInterfaceScale);
  window.localStorage.setItem(scaleStorageKey, interfaceScale.toFixed(2));
  applyInterfaceScale();
}

function applyInterfaceScale() {
  const interfaceRoot = document.getElementById("interface-root");
  if (!interfaceRoot) {
    return;
  }
  interfaceRoot.style.transform = `scale(${interfaceScale})`;
}

async function loadDogViewer() {
  const holder = document.getElementById("dog-webgl-layer");
  if (!holder) {
    return;
  }
  try {
    const THREE = await import("three");
    const { GLTFLoader } = await import(
      "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
    );
    const { clone: cloneSkinnedModel } = await import(
      "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js",
    );

    const scene = new THREE.Scene();
    const halfW = interfaceWidth / 2;
    const halfH = interfaceHeight / 2;
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
    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    holder.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(4, 14, 10);
    key.castShadow = false;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.35);
    fill.position.set(-8, 6, -6);
    fill.castShadow = false;
    scene.add(fill);

    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        "./stylized_dog_low_poly/scene.gltf",
        resolve,
        undefined,
        reject,
      );
    });

    const templateModel = gltf.scene;
    templateModel.updateMatrixWorld(true);
    const bounds0 = new THREE.Box3().setFromObject(templateModel);
    const size0 = new THREE.Vector3();
    bounds0.getSize(size0);
    const targetHeight = 160;
    const fitScale = targetHeight / Math.max(size0.y, 1e-4);
    templateModel.scale.setScalar(fitScale);
    templateModel.updateMatrixWorld(true);
    const bT = new THREE.Box3().setFromObject(templateModel);
    templateModel.position.x -= (bT.min.x + bT.max.x) / 2;
    templateModel.position.y -= bT.min.y;
    templateModel.position.z -= (bT.min.z + bT.max.z) / 2;
    templateModel.rotation.y = THREE.MathUtils.degToRad(-45);

    templateModel.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      child.castShadow = false;
      child.receiveShadow = false;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) {
          continue;
        }
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          mat.metalness = 0;
          mat.roughness = 1;
          if ("envMapIntensity" in mat) {
            mat.envMapIntensity = 0;
          }
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

    /** @type {Array<any | null>} */
    const slotInstances = [];
    const clock = new THREE.Clock();
    const moveSpeedThreshold = 0.32;
    const fadeSec = 0.24;

    function syncWalkIdleForInstance(inst, speed) {
      const wantWalk = speed > moveSpeedThreshold;
      if (wantWalk === inst.animIsWalk) {
        return;
      }
      inst.animIsWalk = wantWalk;
      const idleAction = inst.idleAction;
      const walkAction = inst.walkAction;
      if (idleAction && walkAction) {
        if (wantWalk) {
          idleAction.fadeOut(fadeSec);
          walkAction.reset().fadeIn(fadeSec).play();
        } else {
          walkAction.fadeOut(fadeSec);
          idleAction.reset().fadeIn(fadeSec).play();
        }
      } else if (idleAction && wantWalk === false) {
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
      }
      if (walkAction) {
        walkAction.loop = THREE.LoopRepeat;
      }
      if (idleAction) {
        idleAction.play();
      }
      if (walkAction) {
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
      if (!inst) {
        return;
      }
      inst.mixer.stopAllAction();
      scene.remove(inst.petRoot);
    }

    dog3d = {
      ensureSlotInstances(slots) {
        while (slotInstances.length > slots.length) {
          const tail = slotInstances.pop();
          removeDogInstance(tail);
        }
        while (slotInstances.length < slots.length) {
          slotInstances.push(null);
        }
        for (let i = 0; i < slots.length; i += 1) {
          const want3d = slots[i].petSheet?.kind === "3d";
          if (want3d && !slotInstances[i]) {
            slotInstances[i] = addDogInstance();
          } else if (!want3d && slotInstances[i]) {
            removeDogInstance(slotInstances[i]);
            slotInstances[i] = null;
          }
        }
      },
      update() {
        const dt = Math.min(clock.getDelta(), 0.1);
        for (let i = 0; i < handSlots.length; i += 1) {
          const inst = slotInstances[i];
          if (!inst) {
            continue;
          }
          const slot = handSlots[i];
          if (!slot || !slot.petSprite) {
            continue;
          }
          inst.mixer.update(dt);
          const vx = slot.petSprite.velocity.x;
          const vy = slot.petSprite.velocity.y;
          const speed = Math.hypot(vx, vy);
          syncWalkIdleForInstance(inst, speed);
          if (vx > 0.08) {
            inst.facingX = -1;
          } else if (vx < -0.08) {
            inst.facingX = 1;
          }
          inst.petRoot.scale.set(inst.facingX, 1, 1);
          inst.petRoot.position.set(
            slot.petSprite.position.x - interfaceWidth / 2,
            -(slot.petSprite.position.y - interfaceHeight / 2),
            0,
          );
        }
        renderer.render(scene, camera);
      },
      resize() {
        const hw = interfaceWidth / 2;
        const hh = interfaceHeight / 2;
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
    setStatus("3D dog failed to load — sprite pets only. See browser console for details.");
  }
}

function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}
