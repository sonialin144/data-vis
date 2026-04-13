let video;
let handposeModel;
let predictions = [];

let petType = "dog";

/**
 * One slot per tracked hand: pet + that hand's toy. Index matches filtered hands.
 * @type {Array<{ petSprite: any; wasPetAtToy: boolean; toy: { x: number; y: number; d: number } | null }>}
 */
let handSlots = [];

/** @type {{ update: () => void; resize: () => void; ensureCount: (n: number) => void } | null} */
let dog3d = null;

let modelReady = false;
/** Upper bound passed to ml5 handPose (each hand → ball + dog). */
const MAX_HANDS = 10;
const chaseSpeed = 4;
const DEBUG_HAND = false;
const WINKY_BUBBLE_TEXT = "Hi, I'm Winky!";
/** When pet is this close to the toy (px), Winky's bubble appears. */
const WINKY_REACH_DISTANCE = 48;
/** Same as chase slowdown: pet is considered to have reached the toy (px). */
const TOY_REACH_DISTANCE = 8;

function preload() {
  return loadDogViewer();
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("canvas-holder");
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
  if (dog3d) {
    dog3d.update();
  }

  drawWinkySpeechBubbleIfAtToy();

  drawOverlayText();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  for (const slot of handSlots) {
    const s = slot.petSprite;
    if (s && s.position) {
      s.position.x = constrain(s.position.x, 20, width - 20);
      s.position.y = constrain(s.position.y, 20, height - 20);
    }
  }
  if (dog3d) {
    dog3d.resize();
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
      if (dog3d && typeof petSprite.visible !== "undefined") {
        petSprite.visible = false;
      }
      handSlots.push({ petSprite, wasPetAtToy: false, toy: null });
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
      });
    }
    while (handSlots.length > n) {
      handSlots.pop();
    }
  }
  if (dog3d && typeof dog3d.ensureCount === "function") {
    dog3d.ensureCount(handSlots.length);
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

  if (!dog3d) {
    for (const slot of handSlots) {
      drawPetSpriteShapeAt(slot.petSprite);
    }
  }
}

function drawPetSpriteShapeAt(petSprite) {
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
    ) <= WINKY_REACH_DISTANCE
  );
}

function drawWinkySpeechBubbleIfAtToy() {
  for (const slot of handSlots) {
    if (!slotIsCloseToToy(slot)) {
      continue;
    }
    drawWinkySpeechBubbleForPet(slot.petSprite);
  }
}

function drawWinkySpeechBubbleForPet(petSprite) {
  push();
  const px = petSprite.position.x;
  const py = petSprite.position.y;
  textSize(16);
  textStyle(NORMAL);
  const padX = 18;
  const padY = 12;
  const tw = textWidth(WINKY_BUBBLE_TEXT);
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
  text(WINKY_BUBBLE_TEXT, bubbleCx, bubbleCy);
  rectMode(CORNER);
  pop();
}

function drawOverlayText() {
  fill(255);
  textSize(14);
  textAlign(LEFT, TOP);
  const n = handSlots.length;
  text(`Pet: ${petType}${n ? ` × ${n}` : ""}`, 12, 10);
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

async function loadDogViewer() {
  const holder = document.getElementById("dog-webgl-layer");
  if (!holder) {
    return;
  }
  try {
    const THREE = await import(
      "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    );
    const { GLTFLoader } = await import(
      "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js",
    );

    const scene = new THREE.Scene();
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
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
    renderer.setSize(window.innerWidth, window.innerHeight);
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

    const { clone: cloneSkinnedModel } = await import(
      "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js",
    );

    const templateModel = gltf.scene;
    templateModel.updateMatrixWorld(true);
    const bounds0 = new THREE.Box3().setFromObject(templateModel);
    const size0 = new THREE.Vector3();
    bounds0.getSize(size0);
    const targetHeight = 92;
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
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
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

    const dogInstances = [];
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

    function removeLastDogInstance() {
      const inst = dogInstances.pop();
      if (!inst) {
        return;
      }
      inst.mixer.stopAllAction();
      scene.remove(inst.petRoot);
    }

    dog3d = {
      ensureCount(n) {
        while (dogInstances.length < n) {
          dogInstances.push(addDogInstance());
        }
        while (dogInstances.length > n) {
          removeLastDogInstance();
        }
      },
      update() {
        const dt = Math.min(clock.getDelta(), 0.1);
        for (let i = 0; i < dogInstances.length; i += 1) {
          const inst = dogInstances[i];
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
            slot.petSprite.position.x - width / 2,
            -(slot.petSprite.position.y - height / 2),
            0,
          );
        }
        renderer.render(scene, camera);
      },
      resize() {
        const hw = window.innerWidth / 2;
        const hh = window.innerHeight / 2;
        camera.left = -hw;
        camera.right = hw;
        camera.top = hh;
        camera.bottom = -hh;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      },
    };
  } catch (err) {
    console.warn("3D dog failed to load, using fallback shape.", err);
    dog3d = null;
  }
}

function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}
