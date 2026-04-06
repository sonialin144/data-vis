/** Shared strings + channel id for main sketch and control panel (load before sketch.js). */
window.GACHA_BROADCAST_CHANNEL_NAME = "data-vis-gacha";
window.GACHA_COPY = {
  subline: "You were the first one to give him a chance.",
  footer: "",
};

/** Ordered filenames; main sketch + control panel set from meta.json keys after load */
window.GACHA_ANIMAL_FILES = window.GACHA_ANIMAL_FILES || [];

/** Map filename → { name, description, location }; from assets/animals/meta.json */
window.GACHA_ANIMAL_META = window.GACHA_ANIMAL_META || {};

/** Must stay in sync with CAPSULE_SHELL_PALETTE in capsuleComponent.js */
const GACHA_SHELL_PALETTE = ["#76A8C8", "#DAC58E", "#C98175", "#9ABB76"];

function gachaNormalizeShellHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  const t = hex.trim().toUpperCase();
  return t.startsWith("#") ? t : `#${t}`;
}

function gachaHexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function gachaRgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.min(255, Math.max(0, Math.floor(v + 0.5)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function gachaDarkenRgb(rgb, t) {
  const k = 1 - Math.min(1, Math.max(0, t));
  return {
    r: rgb.r * k,
    g: rgb.g * k,
    b: rgb.b * k,
  };
}

function gachaShellAccentsFromPaletteBase(hex) {
  const key = gachaNormalizeShellHex(hex);
  const base = gachaHexToRgb(key);
  const mid = gachaDarkenRgb(base, 0.3);
  const stroke = gachaDarkenRgb(base, 0.45);
  return {
    light: key,
    mid: gachaRgbToHex(mid.r, mid.g, mid.b),
    stroke: gachaRgbToHex(stroke.r, stroke.g, stroke.b),
  };
}

function gachaBuildCapsuleBackBowlSvg(baseHex) {
  const { light, mid, stroke } = gachaShellAccentsFromPaletteBase(baseHex);
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

function gachaBuildCapsuleFrontBowlSvg(baseHex) {
  const { light, mid, stroke } = gachaShellAccentsFromPaletteBase(baseHex);
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

function gachaSvgToDataUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function gachaIsPaletteShell(hex) {
  const key = gachaNormalizeShellHex(hex);
  if (!key) return false;
  return GACHA_SHELL_PALETTE.some((h) => gachaNormalizeShellHex(h) === key);
}

/**
 * Point back/front bowl img elements at palette-colored SVG data URLs or default assets.
 * Matches capsuleComponent pickLayers + preload palette branch.
 */
window.GACHA_SHELL = {
  setBowlImagesForShellColor(backBowlImg, frontBowlImg, shellColor) {
    const key = gachaNormalizeShellHex(shellColor);
    if (key && gachaIsPaletteShell(key)) {
      backBowlImg.src = gachaSvgToDataUrl(gachaBuildCapsuleBackBowlSvg(key));
      frontBowlImg.src = gachaSvgToDataUrl(gachaBuildCapsuleFrontBowlSvg(key));
    } else {
      backBowlImg.src = "assets/capsule-back-bowl.svg";
      frontBowlImg.src = "assets/capsule-front-bowl.svg";
    }
  },
};
