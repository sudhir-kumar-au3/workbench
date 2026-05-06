// Renders build/icon.svg → build/icon.png at 1024×1024.
// electron-builder picks up build/icon.png and derives .icns / .ico per-platform automatically.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'icon.svg');
const out = path.join(here, 'icon.png');

const svg = await readFile(src);
const png = await sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer();
await writeFile(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
