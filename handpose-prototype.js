let video;
let handposeModel;
let predictions = [];

const PET_SHEETS = [
  { name: "dog-1", idlePath: "./assets/1 Dog/Idle.png", walkPath: "./assets/1 Dog/Walk.png" },
  { name: "dog-2", idlePath: "./assets/2 Dog 2/Idle.png", walkPath: "./assets/2 Dog 2/Walk.png" },
  { name: "cat-1", idlePath: "./assets/3 Cat/Idle.png", walkPath: "./assets/3 Cat/Walk.png" },
  { name: "cat-2", idlePath: "./assets/4 Cat 2/Idle.png", walkPath: "./assets/4 Cat 2/Walk.png" },
];

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
 * @type {Array<{ petSprite: any; wasPetAtToy: boolean; toy: { x: number; y: number; d: number } | null; petSheet: (typeof PET_SHEETS)[number]; facingRight: boolean; petDisplayName: string }>}
 */
let handSlots = [];

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

function preload() {
  for (const sheet of PET_SHEETS) {
    sheet.idleImage = loadImage(sheet.idlePath);
    sheet.walkImage = loadImage(sheet.walkPath);
  }
}

function setup() {
  const canvas = createCanvas(interfaceWidth, interfaceHeight);
  canvas.parent("canvas-holder");
  applySavedScale();
  applyInterfaceScale();
  noSmooth();
  const canvasEl = canvas.elt || document.querySelector("#canvas-holder canvas");
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
    textSize(16);
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

  drawWinkySpeechBubbleIfAtToy();

  drawOverlayText();
}

function windowResized() {
  applyInterfaceScale();
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
      handSlots.push({
        petSprite,
        wasPetAtToy: false,
        toy: null,
        petSheet: random(PET_SHEETS),
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
        petSheet: random(PET_SHEETS),
        facingRight: true,
        petDisplayName: random(PET_DISPLAY_NAMES),
      });
    }
    while (handSlots.length > n) {
      handSlots.pop();
    }
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
  if (!sheet || !sheet.idleImage || !sheet.walkImage) {
    noStroke();
    fill(80, 255, 120);
    circle(centerX, centerY, 80);
    fill(20);
    textAlign(CENTER, CENTER);
    textSize(18);
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
  textSize(16);
  textStyle(NORMAL);
  const padX = 18;
  const padY = 12;
  const tw = textWidth(bubbleText);
  const bubbleW = tw + padX * 2;
  const bubbleH = 40;
  const lift = 108;
  const bubbleCx = constrain(px, bubbleW / 2 + 10, width - bubbleW / 2 - 10);
  const bubbleCy = py - lift;
  const bubbleTop = bubbleCy - bubbleH / 2;
  const bubbleBottom = bubbleCy + bubbleH / 2;

  noStroke();
  fill(255, 255, 255, 245);
  rectMode(CENTER);
  rect(bubbleCx, bubbleCy, bubbleW, bubbleH, 14, 14, 14, 14);

  stroke(45, 45, 55, 200);
  strokeWeight(2);
  noFill();
  rect(bubbleCx, bubbleCy, bubbleW, bubbleH, 14, 14, 14, 14);

  const tailW = 18;
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
  textSize(14);
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
    textSize(14);
    textAlign(LEFT, TOP);
    text("No hand detected", 12, 30);
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

function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}
