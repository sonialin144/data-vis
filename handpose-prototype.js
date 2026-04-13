let video;
let handposeModel;
let predictions = [];

let petSprite;
let petType = "pet";
let petFacingRight = true;
const petRenderSize = 288;
const PET_SHEETS = [
  { name: "dog-1", idlePath: "./assets/1 Dog/Idle.png", walkPath: "./assets/1 Dog/Walk.png" },
  { name: "dog-2", idlePath: "./assets/2 Dog 2/Idle.png", walkPath: "./assets/2 Dog 2/Walk.png" },
  { name: "cat-1", idlePath: "./assets/3 Cat/Idle.png", walkPath: "./assets/3 Cat/Walk.png" },
  { name: "cat-2", idlePath: "./assets/4 Cat 2/Idle.png", walkPath: "./assets/4 Cat 2/Walk.png" },
];
let activePetSheet = null;

let modelReady = false;
let hasToy = false;
let toyPos = { x: 0, y: 0 };
let toyDiameter = 56;
const chaseSpeed = 8;
const DEBUG_HAND = false;
const spriteFrameSize = 48;
const walkFrameThreshold = 0.25;
const toySizeFromHandFactor = 1.1;
const toyMinDiameter = 24;
const toyMaxDiameter = 120;
const nearHandRadius = 54;
const nearHandFollowDelayMs = 320;
const nearHandMoveThreshold = 52;
let followCooldownUntilMs = 0;
let cooldownAnchorToyPos = { x: 0, y: 0 };
const despawnDelayMs = 2000;
const despawnSpeed = 12;
const chaseArriveRadius = 8;
const despawnArriveRadius = 18;
const chaseStartDelayMs = 420;
let noToySinceMs = 0;
let toySeenSinceMs = 0;
let petPhase = "idleOffscreen";
let despawnTarget = { x: 0, y: 0 };

function preload() {
  for (const sheet of PET_SHEETS) {
    sheet.idleImage = loadImage(sheet.idlePath);
    sheet.walkImage = loadImage(sheet.walkPath);
  }
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("canvas-holder");
  noSmooth();
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
  video.style("width", "100vw");
  video.style("height", "100vh");
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
  createPetSprite();
  setupHandpose();
}

function draw() {
  clear();

  if (!(video && video.elt && video.elt.readyState >= 2)) {
    fill(220);
    textAlign(CENTER, CENTER);
    textSize(16);
    text("Waiting for webcam video...", width / 2, height / 2);
  }

  updateToyAnchor();
  if (DEBUG_HAND) {
    drawHandDebug();
  }
  drawToyIfPresent();
  updatePetBehavior();
  if (typeof drawSprites === "function") {
    drawSprites();
  }

  drawOverlayText();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (petSprite) {
    petSprite.position.x = constrain(petSprite.position.x, 20, width - 20);
    petSprite.position.y = constrain(petSprite.position.y, 20, height - 20);
  }
}

function setupHandpose() {
  handposeModel = ml5.handpose(video, () => {
    modelReady = true;
    setStatus("Model loaded. Show your hand.");
  });

  handposeModel.on("predict", (results) => {
    predictions = results;
  });
}

function createPetSprite() {
  selectRandomPetSheet();
  const spawnPoint = getSpawnPoint();
  if (typeof createSprite === "function") {
    petSprite = createSprite(
      spawnPoint.x,
      spawnPoint.y,
      44,
      44,
    );
    petSprite.maxSpeed = chaseSpeed;
    petSprite.friction = 0.05;
    petSprite.visible = false;
    return;
  }
  petSprite = {
    position: { x: spawnPoint.x, y: spawnPoint.y },
    velocity: { x: 0, y: 0 },
    visible: false,
  };
  setStatus("Webcam active. p5.play failed to load, using fallback pet.");
}

function updateToyAnchor() {
  hasToy = false;

  if (!modelReady || predictions.length === 0) {
    if (modelReady) {
      setStatus("Show your hand.");
    }
    return;
  }

  const hand = predictions[0];
  if (!hand || !hand.landmarks || hand.landmarks.length === 0) {
    setStatus("Show your hand.");
    return;
  }

  const landmarks = hand.landmarks;
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const pinkyMcp = landmarks[17];

  if (!wrist || !indexMcp || !middleMcp || !ringMcp || !pinkyMcp) {
    setStatus("Show your hand.");
    return;
  }

  // Palm center from stable palm landmarks.
  const palmX =
    (wrist[0] + indexMcp[0] + middleMcp[0] + ringMcp[0] + pinkyMcp[0]) / 5;
  const palmY =
    (wrist[1] + indexMcp[1] + middleMcp[1] + ringMcp[1] + pinkyMcp[1]) / 5;
  const handWidth = dist(indexMcp[0], indexMcp[1], pinkyMcp[0], pinkyMcp[1]);
  const mappedPalm = mapVideoToCanvas(palmX, palmY);
  const layout = getVideoLayout();
  const scaledHandWidth = handWidth * layout.scale;

  hasToy = true;
  toyDiameter = constrain(
    scaledHandWidth * toySizeFromHandFactor,
    toyMinDiameter,
    toyMaxDiameter,
  );
  toyPos.x = mappedPalm.x;
  toyPos.y = mappedPalm.y;
  setStatus("Toy attached. Pet is running to you.");
}

function drawToyIfPresent() {
  if (!hasToy) {
    return;
  }

  noStroke();
  fill(236, 82, 82);
  circle(toyPos.x, toyPos.y, toyDiameter);
  fill(255, 170, 170, 220);
  circle(
    toyPos.x - toyDiameter * 0.18,
    toyPos.y - toyDiameter * 0.18,
    toyDiameter * 0.3,
  );
}

function updatePetBehavior() {
  if (!petSprite) {
    return;
  }

  const nowMs = millis();
  if (hasToy) {
    if (toySeenSinceMs === 0) {
      toySeenSinceMs = nowMs;
    }
  } else {
    toySeenSinceMs = 0;
  }
  const chaseReady = hasToy && nowMs - toySeenSinceMs >= chaseStartDelayMs;

  if (chaseReady && petPhase === "idleOffscreen") {
    selectRandomPetSheet();
    const spawnPoint = getSpawnPoint();
    petSprite.position.x = spawnPoint.x;
    petSprite.position.y = spawnPoint.y;
    petSprite.velocity.x = 0;
    petSprite.velocity.y = 0;
    petSprite.visible = true;
    petPhase = "chasing";
    noToySinceMs = 0;
  }

  if (!hasToy && petPhase === "chasing" && noToySinceMs === 0) {
    noToySinceMs = nowMs;
  }

  if (
    !hasToy &&
    petPhase === "chasing" &&
    noToySinceMs > 0 &&
    nowMs - noToySinceMs >= despawnDelayMs
  ) {
    petPhase = "despawning";
    despawnTarget = getClosestEdgeDespawnPoint(
      petSprite.position.x,
      petSprite.position.y,
    );
    noToySinceMs = 0;
  }

  if (chaseReady) {
    petPhase = "chasing";
    noToySinceMs = 0;
    const dir = createVector(
      toyPos.x - petSprite.position.x,
      toyPos.y - petSprite.position.y,
    );
    const distanceToToy = dir.mag();
    let shouldChase = true;

    if (distanceToToy <= nearHandRadius) {
      followCooldownUntilMs = nowMs + nearHandFollowDelayMs;
      cooldownAnchorToyPos.x = toyPos.x;
      cooldownAnchorToyPos.y = toyPos.y;
      shouldChase = false;
    } else if (followCooldownUntilMs > nowMs) {
      const toyShift = dist(
        toyPos.x,
        toyPos.y,
        cooldownAnchorToyPos.x,
        cooldownAnchorToyPos.y,
      );
      if (toyShift < nearHandMoveThreshold) {
        shouldChase = false;
      } else {
        followCooldownUntilMs = 0;
      }
    } else {
      followCooldownUntilMs = 0;
    }

    if (shouldChase && distanceToToy > chaseArriveRadius) {
      movePetTowards(toyPos.x, toyPos.y, chaseSpeed);
    } else {
      petSprite.velocity.x *= 0.8;
      petSprite.velocity.y *= 0.8;
    }
  } else if (petPhase === "despawning") {
    followCooldownUntilMs = 0;
    const distanceToDespawn = dist(
      petSprite.position.x,
      petSprite.position.y,
      despawnTarget.x,
      despawnTarget.y,
    );
    if (distanceToDespawn > despawnArriveRadius) {
      movePetTowards(despawnTarget.x, despawnTarget.y, despawnSpeed);
    } else {
      despawnPet();
    }
  } else {
    followCooldownUntilMs = 0;
    petSprite.velocity.x *= 0.9;
    petSprite.velocity.y *= 0.9;
  }

  // If p5.play is unavailable, move the fallback pet manually.
  if (typeof drawSprites !== "function") {
    petSprite.position.x += petSprite.velocity.x;
    petSprite.position.y += petSprite.velocity.y;
    if (petPhase === "despawning") {
      if (isOutsideScreen(petSprite.position.x, petSprite.position.y, despawnArriveRadius)) {
        despawnPet();
      }
    } else {
      petSprite.position.x = constrain(petSprite.position.x, 20, width - 20);
      petSprite.position.y = constrain(petSprite.position.y, 20, height - 20);
    }
  }

  if (petSprite.visible !== false) {
    drawPetSpriteShape();
  }
}

function drawPetSpriteShape() {
  push();
  drawAnimatedPetSprite(
    petSprite.position.x,
    petSprite.position.y,
    petRenderSize,
    petFacingRight,
  );
  pop();
}

function drawOverlayText() {
  fill(255);
  textSize(14);
  textAlign(LEFT, TOP);
  text(`Pet: ${petType}`, 12, 10);
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

  const hand = predictions[0];
  const landmarks = hand.landmarks || [];
  if (landmarks.length === 0) {
    return;
  }

  // Draw all landmarks so we can verify tracking in real time.
  noStroke();
  fill(80, 255, 170);
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

  if (
    hand.boundingBox &&
    hand.boundingBox.topLeft &&
    hand.boundingBox.bottomRight
  ) {
    const topLeft = hand.boundingBox.topLeft;
    const bottomRight = hand.boundingBox.bottomRight;
    const mappedTopLeft = mapVideoToCanvas(topLeft[0], topLeft[1]);
    const mappedBottomRight = mapVideoToCanvas(bottomRight[0], bottomRight[1]);
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

function drawAnimatedPetSprite(centerX, centerY, renderSize, facingRight) {
  if (!activePetSheet || !activePetSheet.idleImage || !activePetSheet.walkImage) {
    noStroke();
    fill(200);
    circle(centerX, centerY, renderSize * 0.6);
    return;
  }

  const speed = sqrt(
    petSprite.velocity.x * petSprite.velocity.x + petSprite.velocity.y * petSprite.velocity.y,
  );
  const isWalking = speed > walkFrameThreshold;
  const spriteSheet = isWalking ? activePetSheet.walkImage : activePetSheet.idleImage;
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

function movePetTowards(targetX, targetY, speed) {
  const dir = createVector(targetX - petSprite.position.x, targetY - petSprite.position.y);
  if (dir.mag() < 0.001) {
    petSprite.velocity.x = 0;
    petSprite.velocity.y = 0;
    return;
  }
  dir.normalize().mult(speed);
  petSprite.velocity.x = dir.x;
  petSprite.velocity.y = dir.y;
  if (abs(dir.x) > 0.05) {
    petFacingRight = dir.x > 0;
  }
}

function getSpawnPoint() {
  return { x: width * 0.5, y: -petRenderSize * 0.35 };
}

function getDespawnPoint() {
  return { x: width * 0.5, y: height + petRenderSize * 0.35 };
}

function getClosestEdgeDespawnPoint(fromX, fromY) {
  const margin = petRenderSize * 0.35;
  const distances = {
    left: fromX,
    right: width - fromX,
    top: fromY,
    bottom: height - fromY,
  };

  let closestEdge = "left";
  let closestDistance = distances.left;
  if (distances.right < closestDistance) {
    closestEdge = "right";
    closestDistance = distances.right;
  }
  if (distances.top < closestDistance) {
    closestEdge = "top";
    closestDistance = distances.top;
  }
  if (distances.bottom < closestDistance) {
    closestEdge = "bottom";
  }

  if (closestEdge === "left") {
    return { x: -margin, y: constrain(fromY, 0, height) };
  }
  if (closestEdge === "right") {
    return { x: width + margin, y: constrain(fromY, 0, height) };
  }
  if (closestEdge === "top") {
    return { x: constrain(fromX, 0, width), y: -margin };
  }
  return { x: constrain(fromX, 0, width), y: height + margin };
}

function selectRandomPetSheet() {
  activePetSheet = random(PET_SHEETS);
  petType = activePetSheet ? activePetSheet.name : "pet";
}

function despawnPet() {
  petSprite.velocity.x = 0;
  petSprite.velocity.y = 0;
  petSprite.visible = false;
  petPhase = "idleOffscreen";
}

function isOutsideScreen(x, y, margin = 0) {
  return x < -margin || x > width + margin || y < -margin || y > height + margin;
}

function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}
