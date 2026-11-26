// Regenerates every launcher icon layer from one geometry definition.
//
//   bun run assets:icons [-- --preview <dir>]
//
// The mark is a stitched fabric label (two patches joined by a seam) carrying
// a checkmark, sitting on cream (light) or deep plum (dark).
//
// Android (adaptive icon, assets/images):
//   android-icon-background.png   plain cloth, full bleed, opaque
//   android-icon-foreground.png   the label on a transparent canvas
//   android-icon-monochrome.png   label outline, stitching and check in black
//                                 on transparent, for Android 13+ themed icons
//   app-icon-{background,foreground,monochrome}.svg  sources for the above
//
// iOS (Icon Composer package, assets/expo.icon):
//   Assets/app-icon-label{,-dark}.svg   the label, back layer
//   Assets/app-icon-check{,-dark}.svg   the check, front layer
// icon.json paints the cloth with its fill and swaps in the -dark files for the
// dark appearance. The system derives tinted mode from the layers.
//
// Things this encodes that are easy to get wrong by hand:
//
// 1. Transparency. Android composites the foreground over the background, so
//    the foreground and monochrome layers need a transparent canvas. A
//    flattened export hides the background and turns the themed icon into a
//    solid tile.
//
// 2. Full bleed. Launchers mask the background with their own shape, so it
//    can't carry rounded corners.
//
// 3. The adaptive safe zone. Layers are 108dp; at most the middle 72dp is
//    visible and the outer 18dp per side is only for parallax. The artwork is
//    drawn in a 380-unit square (the iOS icon), and those 380 units map to the
//    middle 72dp, so the Android icon matches the iOS one. The label's corners
//    stay inside the 66dp keyline circle.
//
// 4. Layer size. Icon Composer draws an SVG at its declared width on a 1024pt
//    canvas; a 380pt SVG fills only the middle third of the icon.
//
// 5. No baked shadow on iOS. Icon Composer adds its own; Android gets a soft
//    one under the label so it lifts off the cloth.

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const IMAGES = path.resolve(fileURLToPath(new URL('../assets/images', import.meta.url)));
const ICON_ASSETS = path.resolve(fileURLToPath(new URL('../assets/expo.icon/Assets', import.meta.url)));

/** Artwork space, shared with the iOS icon. */
const ART = 380;
/** Android layer edge, in artwork units: 380 units fill 72 of 108dp. */
const LAYER = (ART * 108) / 72;
const BLEED = (LAYER - ART) / 2;
const ANDROID_VIEWBOX = `${-BLEED} ${-BLEED} ${LAYER} ${LAYER}`;
const IOS_VIEWBOX = `0 0 ${ART} ${ART}`;
const PNG_SIZE = 1024;
/**
 * Icon Composer places each layer at its intrinsic size on a 1024pt canvas, so
 * the iOS SVGs declare 1024pt or they shrink to the middle of the icon.
 */
const IOS_CANVAS = 1024;

/** The checkmark, centred on the artwork and drawn 1.2x its base size. */
const CHECK_POINTS = [
  [126, 195.5],
  [156.5, 233],
  [255, 147],
];
const CHECK_TRANSFORM = 'translate(190 190) scale(1.2) translate(-190.5 -190)';
/** Stroke width in base units; 30 x 1.2 = 36 after scaling. */
const CHECK_WIDTH = 30;

/** The label: a rounded square in the middle of the artwork. */
const LABEL = { x: 72, y: 72, size: 236, radius: 64 };
/** Running stitch, inset from the label edge. */
const HEM = 14;
/** Seam between the two patches, low enough to clear the check. */
const SEAM = 'M40 292C120 290 180 268 230 246C272 228 306 214 350 208';
const DASH = '14 11';

const PALETTE = {
  light: {
    cloth: '#FAF1E6',
    top: '#D6A99D',
    bottom: '#9F8383',
    thread: '#FAF1E6',
    check: '#FFFFFF',
    shadow: 0.2,
  },
  dark: {
    cloth: '#231A27',
    top: '#B5847A',
    bottom: '#7E6470',
    thread: '#F6E7DA',
    check: '#FFF6EE',
    shadow: 0.5,
  },
};

const rect = (inset, extra) =>
  `<rect x="${LABEL.x + inset}" y="${LABEL.y + inset}" width="${LABEL.size - 2 * inset}" height="${LABEL.size - 2 * inset}" rx="${LABEL.radius - inset}" ${extra}/>`;
const stitch = (color, width, opacity) =>
  `stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${DASH}"`;

function labelLayer(scheme, { shadow = false } = {}) {
  const p = PALETTE[scheme];
  const defs =
    `<clipPath id="label">${rect(0, '')}</clipPath>` +
    `<clipPath id="inside">${rect(HEM + 6, '')}</clipPath>` +
    (shadow
      ? `<filter id="lift" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000000" flood-opacity="${p.shadow}"/></filter>`
      : '');
  const fabric =
    `<g clip-path="url(#label)"><rect x="${LABEL.x}" y="${LABEL.y}" width="${LABEL.size}" height="${LABEL.size}" fill="${p.top}"/>` +
    `<path d="${SEAM}V400H40Z" fill="${p.bottom}"/></g>`;
  return {
    defs,
    body:
      (shadow ? `<g filter="url(#lift)">${fabric}</g>` : fabric) +
      `<path d="${SEAM}" transform="translate(0 7)" clip-path="url(#inside)" fill="none" ${stitch(p.thread, 3.5, 0.75)}/>` +
      rect(HEM, `fill="none" ${stitch(p.thread, 4, 0.9)}`),
  };
}

/**
 * The check as two filled capsules rather than a stroked polyline. Icon
 * Composer fills every path regardless of `fill="none"`, which turns a stroked
 * check into a check plus a filled sliver of triangle.
 */
function checkLayer(color) {
  const capsule = ([x1, y1], [x2, y2]) => {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const r = CHECK_WIDTH / 2;
    return `<rect x="${x1 - r}" y="${y1 - r}" width="${length + CHECK_WIDTH}" height="${CHECK_WIDTH}" rx="${r}" transform="rotate(${angle.toFixed(4)} ${x1} ${y1})"/>`;
  };
  const [a, b, c] = CHECK_POINTS;
  return `<g transform="${CHECK_TRANSFORM}" fill="${color}">${capsule(a, b)}${capsule(b, c)}</g>`;
}

/** One colour only: Android tints the alpha for themed icons. */
function monochrome(color) {
  return (
    rect(4, `fill="none" stroke="${color}" stroke-width="10"`) +
    rect(22, `fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${DASH}"`) +
    checkLayer(color)
  );
}

function svg(viewBox, size, body, defs = '') {
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">
${defs ? `<defs>${defs}</defs>\n` : ''}${body}
</svg>
`;
}

function write(file, content) {
  writeFileSync(file, content);
  console.log('wrote', path.relative(process.cwd(), file));
}

function png(file, source, size = PNG_SIZE) {
  write(file, new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng());
}

// Android adaptive layers.
const lifted = labelLayer('light', { shadow: true });
const android = {
  background: svg(
    ANDROID_VIEWBOX,
    PNG_SIZE,
    `<rect x="${-BLEED}" y="${-BLEED}" width="${LAYER}" height="${LAYER}" fill="${PALETTE.light.cloth}"/>`
  ),
  foreground: svg(ANDROID_VIEWBOX, PNG_SIZE, lifted.body + checkLayer(PALETTE.light.check), lifted.defs),
  monochrome: svg(ANDROID_VIEWBOX, PNG_SIZE, monochrome('#000000')),
};
for (const [layer, source] of Object.entries(android)) {
  write(path.join(IMAGES, `app-icon-${layer}.svg`), source);
  png(path.join(IMAGES, `android-icon-${layer}.png`), source);
}

// iOS Icon Composer layers.
for (const scheme of ['light', 'dark']) {
  const suffix = scheme === 'dark' ? '-dark' : '';
  const label = labelLayer(scheme);
  write(path.join(ICON_ASSETS, `app-icon-label${suffix}.svg`), svg(IOS_VIEWBOX, IOS_CANVAS, label.body, label.defs));
  write(path.join(ICON_ASSETS, `app-icon-check${suffix}.svg`), svg(IOS_VIEWBOX, IOS_CANVAS, checkLayer(PALETTE[scheme].check)));
}

// Flattened previews for eyeballing a change: iOS light/dark, Android in a
// circle mask, and the themed icon.
if (process.argv.includes('--preview')) {
  const out = path.resolve(process.argv[process.argv.indexOf('--preview') + 1] ?? '.');
  mkdirSync(out, { recursive: true });
  const masked = (shape, cloth, body, defs) =>
    svg(
      IOS_VIEWBOX,
      ART,
      `<g clip-path="url(#mask)"><rect width="${ART}" height="${ART}" fill="${cloth}"/>${body}</g>`,
      `${defs}<clipPath id="mask">${shape === 'circle' ? `<circle cx="190" cy="190" r="190"/>` : `<rect width="${ART}" height="${ART}" rx="85"/>`}</clipPath>`
    );
  for (const scheme of ['light', 'dark']) {
    const l = labelLayer(scheme, { shadow: true });
    png(path.join(out, `ios-${scheme}.png`), masked('squircle', PALETTE[scheme].cloth, l.body + checkLayer(PALETTE[scheme].check), l.defs), 300);
  }
  png(path.join(out, 'android.png'), masked('circle', PALETTE.light.cloth, lifted.body + checkLayer(PALETTE.light.check), lifted.defs), 300);
  png(path.join(out, 'android-themed.png'), masked('circle', '#2B2930', monochrome('#D0BCFF'), ''), 300);
}
