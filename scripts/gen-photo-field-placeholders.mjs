// Generates the numbered placeholder photos for the drag-around photo field:
// site/img/photo-field/01.jpg … 20.jpg, in the three shapes of the photo-field
// block (tall 2:3, portrait ~5:6, landscape ~5:4), using ffmpeg (no other dependencies).
//
// Usage:  node scripts/gen-photo-field-placeholders.mjs
//         FFMPEG="C:/Users/WongR/ffmpeg-portable/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe" node scripts/gen-photo-field-placeholders.mjs
//
// Overwrites existing files of the same name, so only run it while the folder
// still holds placeholders (or move your real photos out first).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const outDir = fileURLToPath(new URL('../site/img/photo-field/', import.meta.url));
mkdirSync(outDir, { recursive: true });

// Warm Muted palette pairs (light → dark, optional number colour), cycled through the photos.
const palettes = [
  ['C9A98F', 'A9695A'], // clay
  ['A8A179', '8C8560'], // olive
  ['EADCC8', 'D8BFA8', '332A22'], // sand (dark number)
  ['F0E6D6', 'C2967E', '332A22'], // paper (dark number)
  ['B88A6B', '6B4A3C'], // deep
  ['D9C7B8', '8F8275'], // muted
];
// The shapes of the block's 11 slots, in slot order (see BLOCK in site/js/photo-field.js),
// so placeholder n fills slot (n - 1) % 11 exactly: 8 tall, 9 portrait, 3 landscape.
const shapes = { tall: [600, 900], portrait: [640, 774], landscape: [800, 648] };
const slotShapes = ['tall', 'portrait', 'landscape', 'tall', 'portrait', 'portrait', 'tall', 'tall', 'portrait', 'landscape', 'portrait'];
const order = Array.from({ length: 20 }, (_, i) => slotShapes[i % slotShapes.length]);

const fontCandidates = ['C:/Windows/Fonts/georgia.ttf', '/System/Library/Fonts/Supplemental/Georgia.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'];
const font = fontCandidates.find((f) => existsSync(f));

function render(file, [w, h], [c0, c1, ink], label, withText) {
  const color = ink ? `0x${ink}@0.7` : 'white@0.85';
  const text = withText && font
    ? `,drawtext=fontfile='${font.replace(/:/g, '\\:')}':text='${label}':fontsize=${Math.round(Math.min(w, h) * 0.32)}:fontcolor=${color}:x=(w-text_w)/2:y=(h-text_h)/2`
    : '';
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `gradients=s=${w}x${h}:nb_colors=2:c0=0x${c0}:c1=0x${c1}:x0=0:y0=0:x1=${w}:y1=${h}:speed=0`,
    '-vf', `noise=alls=6:allf=t${text}`,
    '-frames:v', '1', '-q:v', '5', file,
  ];
  return spawnSync(ffmpeg, args, { encoding: 'utf8' });
}

let numbered = true;
for (let i = 0; i < order.length; i++) {
  const label = String(i + 1).padStart(2, '0');
  const file = `${outDir}${label}.jpg`;
  let r = render(file, shapes[order[i]], palettes[i % palettes.length], label, numbered);
  if (r.error) {
    console.error(`Could not run ffmpeg (${ffmpeg}). Set FFMPEG to its full path.`);
    process.exit(1);
  }
  if (r.status !== 0 && numbered) {
    numbered = false;
    console.warn('drawtext unavailable in this ffmpeg build; writing placeholders without numbers.');
    r = render(file, shapes[order[i]], palettes[i % palettes.length], label, false);
  }
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
  console.log(`${label}.jpg  ${order[i].padEnd(9)} ${Math.round(statSync(file).size / 1024)} KB`);
}
