// Checks a hand-made photo-field layout from the layout editor and turns it into
// the source of site/js/photo-layout.js. Used by scripts/serve.mjs (the editor's
// Save button); kept separate so it can be unit-tested.

const PHOTO_PATH = /^\.\/img\/[A-Za-z0-9_\-./ ]+\.(jpe?g|png|webp|gif|avif)$/i;
const round = (v) => Math.round(v * 10) / 10;

/**
 * Validates and tidies a layout: { width, height, shift, photos: [{ src, x, y, w, z }] }
 * (px of the editor's phone-width frame). Returns null for "no hand layout".
 * Throws an Error with a readable message if anything is out of range.
 */
export function cleanLayout(input) {
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('The layout must be an object or null.');
  const num = (v, name, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number from ${min} to ${max}.`);
    return round(n);
  };
  const width = num(input.width, 'Frame width', 100, 4000);
  const height = num(input.height, 'Frame height', 100, 20000);
  const shift = num(input.shift ?? 0, 'Sideways offset', -20000, 20000);
  if (!Array.isArray(input.photos) || input.photos.length > 500) throw new Error('photos must be a list of at most 500 photos.');
  const photos = input.photos.map((p, i) => {
    const src = String(p?.src ?? '');
    if (!PHOTO_PATH.test(src) || src.includes('..')) throw new Error(`Photo ${i + 1} has an unexpected file path: ${src.slice(0, 80)}`);
    return {
      src,
      x: num(p.x, `Photo ${i + 1} x`, -40000, 40000),
      y: num(p.y, `Photo ${i + 1} y`, -40000, 40000),
      w: num(p.w, `Photo ${i + 1} width`, 5, 4000),
      z: Math.round(num(p.z ?? 0, `Photo ${i + 1} layer`, -10000, 10000)),
    };
  });
  return { width, height, shift, photos };
}

/** The full text of site/js/photo-layout.js for a (cleaned) layout. */
export function layoutModule(layout) {
  const head = `// Hand-made layout for the photo field, written by the layout editor
// (npm run serve, then open http://localhost:8080/__layout-editor/).
// null = use the automatic arrangement (afterduskmedia.com's block).
`;
  if (!layout) return `${head}export const photoLayout = null;\n`;
  const lines = layout.photos.map((p) => `    ${JSON.stringify(p)},`).join('\n');
  return `${head}// Sizes are px of a ${layout.width}px-wide frame (about a phone screen); x, y are each
// photo's centre and w its width (its height follows its own shape). Higher z = on top.
export const photoLayout = {
  width: ${layout.width},
  height: ${layout.height},
  shift: ${layout.shift}, // how far down each sideways repeat of the frame is moved
  photos: [
${lines}
  ],
};
`;
}
