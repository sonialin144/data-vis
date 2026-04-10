let video;
let handposeModel;
let predictions = [];

let petSprite;
let petType;
let petSheet;
let petFrames = [];
let usingImagePet = false;

let modelReady = false;
let hasToy = false;
let toyPos = { x: 0, y: 0 };
let toyDiameter = 28;
const chaseSpeed = 4;
const DEBUG_HAND = false;

function preload() {
  petSheet = loadImage(
    "./assets/pet-sheet.png",
    () => {
      petFrames = slicePetSheet(petSheet);
    },
    () => {
      petFrames = [];
    },
  );
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("canvas-holder");
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
  petType = random() < 0.5 ? "dog" : "cat";
  if (typeof createSprite === "function") {
    petSprite = createSprite(
      random(80, width - 80),
      random(80, height - 80),
      44,
      44,
    );
    petSprite.maxSpeed = chaseSpeed;
    petSprite.friction = 0.05;
    usingImagePet = false;
    return;
  }
  petSprite = {
    position: { x: random(80, width - 80), y: random(80, height - 80) },
    velocity: { x: 0, y: 0 },
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
  toyDiameter = constrain(scaledHandWidth * 2, 24, 260);
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

  if (hasToy) {
    const dir = createVector(
      toyPos.x - petSprite.position.x,
      toyPos.y - petSprite.position.y,
    );
    const distanceToToy = dir.mag();

    if (distanceToToy > 8) {
      dir.normalize().mult(chaseSpeed);
      petSprite.velocity.x = dir.x;
      petSprite.velocity.y = dir.y;
    } else {
      petSprite.velocity.x *= 0.8;
      petSprite.velocity.y *= 0.8;
    }
  } else {
    petSprite.velocity.x *= 0.9;
    petSprite.velocity.y *= 0.9;
  }

  // If p5.play is unavailable, move the fallback pet manually.
  if (typeof drawSprites !== "function") {
    petSprite.position.x += petSprite.velocity.x;
    petSprite.position.y += petSprite.velocity.y;
    petSprite.position.x = constrain(petSprite.position.x, 20, width - 20);
    petSprite.position.y = constrain(petSprite.position.y, 20, height - 20);
  }

  if (!usingImagePet) {
    drawPetSpriteShape();
  }
}

function drawPetSpriteShape() {
  push();
  noStroke();
  fill(80, 255, 120);
  circle(petSprite.position.x, petSprite.position.y, 80);
  fill(20);
  textAlign(CENTER, CENTER);
  textSize(18);
  text(petType, petSprite.position.x, petSprite.position.y + 1);
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

function slicePetSheet(sheet) {
  if (!sheet || !sheet.width || !sheet.height) {
    return [];
  }
  const cols = 3;
  const rows = 3;
  const cellW = floor(sheet.width / cols);
  const cellH = floor(sheet.height / rows);
  const frames = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const insetX = floor(cellW * 0.06);
      const insetY = floor(cellH * 0.06);
      const w = cellW - insetX * 2;
      const h = cellH - insetY * 2;
      const x = col * cellW + insetX;
      const y = row * cellH + insetY;
      frames.push(sheet.get(x, y, w, h));
    }
  }
  return frames;
}

function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}
