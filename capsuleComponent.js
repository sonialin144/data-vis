/**
 * Capsule: composite 306×307 artboard (viewBox), four SVG layers + animal.
 * Order (bottom → top): #bowl → #back-dome → animal → #front-dome → #band.
 * #back-dome and #front-dome share pivot (3, 182.79) and the same rotation (CSS-style deg).
 */

const CAPSULE_SHELL_PALETTE = ["#76A8C8", "#DAC58E", "#C98175", "#9ABB76"];

const CAPSULE_ANIMAL_MAX_FRAC = 0.75;

/** Single-capsule viewBox (overflow visible in source SVG; we draw in this box). */
const CAPSULE_VB = { w: 306, h: 307 };

/** #bowl — back-bowl layer origin in viewBox space. */
const BOWL_ORIGIN = { x: 2.8, y: 128.98 };
const BOWL_SIZE = { w: 301, h: 178 };

/** #back-dome — full width, pivot for dome rotation (CSS transform-origin in spec). */
const BACK_DOME_ORIGIN = { x: 0, y: 0 };
const BACK_DOME_SIZE = { w: 306, h: 229 };
const DOME_PIVOT = { x: 3, y: 182.79 };

/** #front-dome — inner offset after outer pivot rotation. */
const FRONT_DOME_INNER = { x: 15.1, y: 15.1 };
const FRONT_DOME_SIZE = { w: 276, h: 213 };

/** #band — front-bowl. */
const BAND_ORIGIN = { x: 2.8, y: 182.98 };
const BAND_SIZE = { w: 301, h: 124 };

/** Animal center in viewBox space (inside dome). */
const ANIMAL_CENTER = { x: 153, y: 153 };
const ANIMAL_MAX_RADIUS_U = 88;

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        constrain(floor(v + 0.5), 0, 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function darkenRgb(rgb, t) {
  const k = 1 - constrain(t, 0, 1);
  return {
    r: rgb.r * k,
    g: rgb.g * k,
    b: rgb.b * k,
  };
}

function shellAccentsFromPaletteBase(hex) {
  const key = normalizeShellHex(hex);
  const base = hexToRgb(key);
  const mid = darkenRgb(base, 0.3);
  const stroke = darkenRgb(base, 0.45);
  return {
    light: key,
    mid: rgbToHex(mid.r, mid.g, mid.b),
    stroke: rgbToHex(stroke.r, stroke.g, stroke.b),
  };
}

function buildCapsuleBackBowlSvg(baseHex) {
  const { light, mid, stroke } = shellAccentsFromPaletteBase(baseHex);
  const id = "g_bb_" + baseHex.replace("#", "");
  return `<svg width="301" height="178" viewBox="0 0 301 178" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M150.218 2C210.254 2 247.445 15.288 269.561 28.4355C280.624 35.0127 287.94 41.5693 292.471 46.4453C294.737 48.8838 296.308 50.9041 297.304 52.2988C297.761 52.9392 298.096 53.449 298.322 53.8057C284.579 123.045 223.493 175.24 150.218 175.24C76.943 175.24 15.8569 123.045 2.11328 53.8057C2.33969 53.4489 2.67532 52.9394 3.13281 52.2988C4.12884 50.9041 5.69985 48.8838 7.96582 46.4453C12.4968 41.5693 19.8128 35.0127 30.876 28.4355C52.9912 15.288 90.1816 2.00007 150.218 2Z" fill="white"/>
  <path d="M150.218 2C210.254 2 247.445 15.288 269.561 28.4355C280.624 35.0127 287.94 41.5693 292.471 46.4453C294.737 48.8838 296.308 50.9041 297.304 52.2988C297.761 52.9392 298.096 53.449 298.322 53.8057C284.579 123.045 223.493 175.24 150.218 175.24C76.943 175.24 15.8569 123.045 2.11328 53.8057C2.33969 53.4489 2.67532 52.9394 3.13281 52.2988C4.12884 50.9041 5.69985 48.8838 7.96582 46.4453C12.4968 41.5693 19.8128 35.0127 30.876 28.4355C52.9912 15.288 90.1816 2.00007 150.218 2Z" fill="url(#${id})" fill-opacity="0.7"/>
  <path d="M150.218 2C210.254 2 247.445 15.288 269.561 28.4355C280.624 35.0127 287.94 41.5693 292.471 46.4453C294.737 48.8838 296.308 50.9041 297.304 52.2988C297.761 52.9392 298.096 53.449 298.322 53.8057C284.579 123.045 223.493 175.24 150.218 175.24C76.943 175.24 15.8569 123.045 2.11328 53.8057C2.33969 53.4489 2.67532 52.9394 3.13281 52.2988C4.12884 50.9041 5.69985 48.8838 7.96582 46.4453C12.4968 41.5693 19.8128 35.0127 30.876 28.4355C52.9912 15.288 90.1816 2.00007 150.218 2Z" stroke="${stroke}" stroke-width="4"/>
  <defs>
    <linearGradient id="${id}" x1="0" y1="88.6201" x2="300.436" y2="88.6201" gradientUnits="userSpaceOnUse">
      <stop stop-color="${light}"/>
      <stop offset="1" stop-color="${mid}"/>
    </linearGradient>
  </defs>
</svg>`;
}

function buildCapsuleFrontBowlSvg(baseHex) {
  const { light, mid, stroke } = shellAccentsFromPaletteBase(baseHex);
  const id = "g_fb_" + baseHex.replace("#", "");
  return `<svg width="301" height="124" viewBox="0 0 301 124" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M297.37 4.82324C281.943 71.8368 221.914 121.808 150.218 121.808C78.629 121.807 18.6735 71.9866 3.13574 5.125C4.51654 6.17728 6.21515 7.42243 8.23047 8.81348C14.5447 13.1718 23.969 18.9651 36.4629 24.752C61.4558 36.328 98.7195 47.874 147.913 47.874C197.104 47.874 235.51 36.329 261.638 24.7656C274.7 18.9845 284.694 13.1993 291.435 8.84863C293.825 7.30571 295.806 5.94147 297.37 4.82324Z" fill="url(#${id})" fill-opacity="0.78" stroke="${stroke}" stroke-width="4"/>
  <defs>
    <linearGradient id="${id}" x1="0" y1="62" x2="301" y2="62" gradientUnits="userSpaceOnUse">
      <stop stop-color="${light}"/>
      <stop offset="1" stop-color="${mid}"/>
    </linearGradient>
  </defs>
</svg>`;
}

function svgToDataUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function normalizeShellHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const t = hex.trim().toUpperCase();
  return t.startsWith("#") ? t : `#${t}`;
}

function drawImageAlpha(pg, img, x, y, w, h, alpha0to255) {
  const alpha = constrain(floor(alpha0to255 + 0.5), 0, 255) / 255;
  if (alpha <= 0) return;
  // Do not use drawingContext.save/restore — that resets the canvas CTM and
  // breaks pg.rotate() from drawDomeGroup(). Only toggle globalAlpha so dome
  // pixels keep their original RGB (unlike tint(), which multiplies color).
  if (pg) {
    const ctx = pg.drawingContext;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    pg.image(img, x, y, w, h);
    ctx.globalAlpha = prev;
  } else {
    const ctx = drawingContext;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    image(img, x, y, w, h);
    ctx.globalAlpha = prev;
  }
}

/**
 * @typedef {{
 *   backBowl: p5.Image;
 *   backDome: p5.Image;
 *   frontDome: p5.Image;
 *   frontBowl: p5.Image;
 * }} CapsuleLayerImages
 */

function createCapsuleComponent() {
  /** @type {CapsuleLayerImages | null} */
  let defaultLayers = null;
  /** @type {Record<string, CapsuleLayerImages>} */
  let paletteLayers = {};
  /** @type {p5.Image[]} */
  let animalImages = [];

  function pickLayers(shellColor) {
    const key = normalizeShellHex(shellColor);
    const usePalette =
      key &&
      CAPSULE_SHELL_PALETTE.map((h) => normalizeShellHex(h)).includes(key);
    if (usePalette && paletteLayers[key]) return paletteLayers[key];
    return defaultLayers;
  }

  function pushCapsuleSpace(pg, cx, cy, angleRad, displayWidth) {
    const s = displayWidth / CAPSULE_VB.w;
    const ax = CAPSULE_VB.w / 2;
    const ay = CAPSULE_VB.h / 2;
    if (pg) {
      pg.push();
      pg.translate(cx, cy);
      pg.rotate(angleRad);
      pg.scale(s);
      pg.translate(-ax, -ay);
      pg.imageMode(CORNER);
    } else {
      push();
      translate(cx, cy);
      rotate(angleRad);
      scale(s);
      translate(-ax, -ay);
      imageMode(CORNER);
    }
  }

  function popCapsuleSpace(pg) {
    if (pg) pg.pop();
    else pop();
  }

  /**
   * Shared pivot rotation for #back-dome and #front-dome outer group.
   */
  function drawDomeGroup(pg, domeRad, drawFn) {
    const px = DOME_PIVOT.x;
    const py = DOME_PIVOT.y;
    if (pg) {
      pg.push();
      pg.translate(px, py);
      pg.rotate(domeRad);
      pg.translate(-px, -py);
      drawFn(pg);
      pg.pop();
    } else {
      push();
      translate(px, py);
      rotate(domeRad);
      translate(-px, -py);
      drawFn(null);
      pop();
    }
  }

  /**
   * Warm rays from the pet center (viewBox space), behind the animal draw.
   * @param {number | null} glowElapsedMs — ms since done reveal; null skips
   */
  function drawAnimalGlowRays(pg, hopY, glowElapsedMs, da) {
    if (glowElapsedMs == null || glowElapsedMs < 0) return;
    const fade = constrain(da / 255, 0, 1);
    const ax = ANIMAL_CENTER.x;
    const ay = ANIMAL_CENTER.y + hopY;
    const raysA = 14;
    const raysB = 9;
    const rotA = glowElapsedMs * 0.00024;
    const rotB = glowElapsedMs * -0.00017;
    const pulse = 0.42 + 0.58 * sin(glowElapsedMs * 0.0034);

    const fan = (usePg, rot, n, r0, r1, w0, a0, phase) => {
      for (let i = 0; i < n; i++) {
        const ang = rot + (TWO_PI / n) * i;
        const wob = sin(glowElapsedMs * 0.0038 + i * phase) * 18;
        const len = r1 + wob;
        const al = constrain(
          a0 *
            pulse *
            fade *
            (0.5 + 0.5 * sin(glowElapsedMs * 0.0026 + i * 0.7)),
          0,
          255,
        );
        if (usePg) {
          usePg.stroke(255, 234, 175, al);
          usePg.strokeWeight(w0 * pulse);
          usePg.line(
            ax + cos(ang) * r0,
            ay + sin(ang) * r0,
            ax + cos(ang) * len,
            ay + sin(ang) * len,
          );
        } else {
          stroke(255, 234, 175, al);
          strokeWeight(w0 * pulse);
          line(
            ax + cos(ang) * r0,
            ay + sin(ang) * r0,
            ax + cos(ang) * len,
            ay + sin(ang) * len,
          );
        }
      }
    };

    if (pg) {
      pg.push();
      pg.strokeCap(ROUND);
      pg.noFill();
      fan(pg, rotB, raysB, 4, 78, 9.2, 88, 0.55);
      fan(pg, rotA, raysA, 7, 118, 5.8, 62, 0.42);
      pg.pop();
    } else {
      push();
      strokeCap(ROUND);
      noFill();
      fan(null, rotB, raysB, 4, 78, 9.2, 88, 0.55);
      fan(null, rotA, raysA, 7, 118, 5.8, 62, 0.42);
      pop();
    }
  }

  function drawComposite(
    pg,
    cx,
    cy,
    angleRad,
    displayWidth,
    layers,
    animal,
    animW,
    animH,
    hopY,
    domeRad,
    da,
    glowElapsedMs,
  ) {
    const drawImg = (img, x, y, w, h, alpha) =>
      drawImageAlpha(pg, img, x, y, w, h, alpha);

    pushCapsuleSpace(pg, cx, cy, angleRad, displayWidth);

    drawImg(
      layers.backBowl,
      BOWL_ORIGIN.x,
      BOWL_ORIGIN.y,
      BOWL_SIZE.w,
      BOWL_SIZE.h,
      da,
    );

    drawDomeGroup(pg, domeRad, () => {
      drawImg(
        layers.backDome,
        BACK_DOME_ORIGIN.x,
        BACK_DOME_ORIGIN.y,
        BACK_DOME_SIZE.w,
        BACK_DOME_SIZE.h,
        da,
      );
    });

    drawAnimalGlowRays(pg, hopY, glowElapsedMs, da);

    if (pg) {
      pg.push();
      pg.translate(ANIMAL_CENTER.x, ANIMAL_CENTER.y + hopY);
      pg.imageMode(CENTER);
      drawImageAlpha(pg, animal, 0, 0, animW, animH, da);
      pg.pop();
      pg.imageMode(CORNER);
    } else {
      push();
      translate(ANIMAL_CENTER.x, ANIMAL_CENTER.y + hopY);
      imageMode(CENTER);
      drawImageAlpha(null, animal, 0, 0, animW, animH, da);
      pop();
      imageMode(CORNER);
    }

    drawDomeGroup(pg, domeRad, () => {
      drawImg(
        layers.frontDome,
        FRONT_DOME_INNER.x,
        FRONT_DOME_INNER.y,
        FRONT_DOME_SIZE.w,
        FRONT_DOME_SIZE.h,
        da,
      );
    });

    drawImg(
      layers.frontBowl,
      BAND_ORIGIN.x,
      BAND_ORIGIN.y,
      BAND_SIZE.w,
      BAND_SIZE.h,
      da,
    );

    popCapsuleSpace(pg);
  }

  return {
    preload() {
      defaultLayers = {
        backBowl: loadImage("assets/capsule-back-bowl.svg"),
        backDome: loadImage("assets/capsule-back-dome.svg"),
        frontDome: loadImage("assets/capsule-front-dome.svg"),
        frontBowl: loadImage("assets/capsule-front-bowl.svg"),
      };

      for (const hex of CAPSULE_SHELL_PALETTE) {
        const key = normalizeShellHex(hex);
        paletteLayers[key] = {
          backBowl: loadImage(svgToDataUrl(buildCapsuleBackBowlSvg(hex))),
          backDome: defaultLayers.backDome,
          frontDome: defaultLayers.frontDome,
          frontBowl: loadImage(svgToDataUrl(buildCapsuleFrontBowlSvg(hex))),
        };
      }

      const files =
        typeof window !== "undefined" &&
        Array.isArray(window.GACHA_ANIMAL_FILES) &&
        window.GACHA_ANIMAL_FILES.length > 0
          ? window.GACHA_ANIMAL_FILES
          : [];
      animalImages = files.map((name) =>
        loadImage(`assets/animals/${name}`),
      );
    },

    getCapsuleAspectRatio() {
      return CAPSULE_VB.w / CAPSULE_VB.h;
    },

    displayHeightForWidth(displayWidth) {
      return displayWidth / this.getCapsuleAspectRatio();
    },

    getAnimalCount() {
      return animalImages.length;
    },

    /**
     * @param {string | null | undefined} shellColor — palette hex or null for default asset colors
     * @param {p5.Graphics | null | undefined} target
     * @param {number} [domeOpenDeg] — rotation for both domes (deg, same as CSS rotate(); e.g. 0 → -135)
     * @param {number} [drawAlpha] — 0–255
     * @param {number} [animalScaleMul] — extra scale on pet only (e.g. done-phase reveal); default 1
     * @param {number | null} [glowElapsedMs] — ms for rotating glow rays; null disables
     */
    drawAt(
      cx,
      cy,
      displayWidth,
      angleRadians,
      animalIndex,
      shellColor,
      target,
      animalOffsetY,
      domeOpenDeg,
      drawAlpha,
      animalScaleMul,
      glowElapsedMs,
    ) {
      if (!defaultLayers || animalImages.length === 0) return;

      const layers = pickLayers(shellColor);
      if (
        !layers ||
        !layers.backBowl ||
        !layers.backDome ||
        !layers.frontDome ||
        !layers.frontBowl
      ) {
        return;
      }

      const hopY =
        animalOffsetY != null && !Number.isNaN(animalOffsetY)
          ? animalOffsetY
          : 0;
      const deg =
        domeOpenDeg != null && !Number.isNaN(domeOpenDeg) ? domeOpenDeg : 0;
      const domeRad = radians(deg);
      const da =
        drawAlpha != null && !Number.isNaN(drawAlpha)
          ? constrain(drawAlpha, 0, 255)
          : 255;

      const idx = floor(constrain(animalIndex, 0, animalImages.length - 1));
      const animal = animalImages[idx];

      const maxSideArt = 2 * ANIMAL_MAX_RADIUS_U * CAPSULE_ANIMAL_MAX_FRAC;
      const ar = min(maxSideArt / animal.width, maxSideArt / animal.height);
      let animW = animal.width * ar;
      let animH = animal.height * ar;
      const mul =
        animalScaleMul != null &&
        !Number.isNaN(animalScaleMul) &&
        animalScaleMul > 0
          ? animalScaleMul
          : 1;
      animW *= mul;
      animH *= mul;
      const glowMs =
        glowElapsedMs != null && !Number.isNaN(glowElapsedMs)
          ? glowElapsedMs
          : null;

      const pg = target;
      drawComposite(
        pg,
        cx,
        cy,
        angleRadians,
        displayWidth,
        layers,
        animal,
        animW,
        animH,
        hopY,
        domeRad,
        da,
        glowMs,
      );
    },
  };
}
