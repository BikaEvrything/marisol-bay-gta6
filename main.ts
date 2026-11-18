// Marisol Bay's entry program (Node 22+, standard library only).
//
// What it does, in order:
//   1. Validates the entry it finds beside this file: game/ (the whole static game), screenshots/
//      (3-4 genuine browser renders, caps checked, magic bytes and pixel dimensions parsed from
//      the image headers themselves), and shots.json (the scene list the capture tool drives).
//   2. Copies game/ and screenshots/ into MAKEFUN_OUTPUT_DIR (or /output), deterministically:
//      files are walked in sorted order and nothing time-dependent is written.
//   3. Writes dossier.json with buildDossier from the unchanged vendored kit library.
//   4. Writes manifest.json — sha256 of every handed-in file, the dossier included — and prints
//      a summary, so a second run into a second directory can be diffed byte for byte.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Build the entry with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DOSSIER_MAX_BYTES } from './vendor/makefun-game.ts';

// --- the caps the make.fun grader holds an entry to (kit RULES.txt, verbatim numbers) ----------

const SCREENSHOT_MAX_COUNT = 4;
const SCREENSHOT_MIN_COUNT = 3;
const SCREENSHOT_MAX_BYTES = 256 * 1024;
const SCREENSHOT_LONG_SIDE = 1280;
const SCREENSHOT_SHORT_SIDE = 480;
const GAME_MAX_ENTRIES = 993;
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const TEXT_MAX_BYTES = 163840;
const OUTPUT_MAX_ENTRIES = 1000;
const OUTPUT_MAX_BYTES = 64 * 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

class BuildError extends Error {}

// --- small helpers ------------------------------------------------------------------------------

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireDir(dir, label) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
    throw new BuildError(`${label}: no such directory at ${dir}`);
  }
  return dir;
}

/** Every regular file under `dir`, as sorted relative paths (no symlinks anywhere). */
function walkFiles(dir) {
  const found = [];
  const visit = (absolute, rel) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const abs = join(absolute, entry.name);
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new BuildError(`${abs}: symlinks are not allowed in the entry`);
      if (entry.isDirectory()) visit(abs, relPath);
      else if (entry.isFile()) found.push(relPath);
      else throw new BuildError(`${abs}: not a regular file`);
    }
  };
  visit(dir, '');
  return found.sort();
}

/** The pixel dimensions of a PNG (IHDR) or a whole-baseline JPEG (SOF markers), from the bytes. */
function imageDimensions(bytes, name) {
  if (PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (JPEG_MAGIC.every((b, i) => bytes[i] === b)) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) throw new BuildError(`screenshots/${name}: corrupt JPEG marker stream`);
      const marker = bytes[at + 1];
      const length = bytes.readUInt16BE(at + 2);
      // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
      }
      at += 2 + length;
    }
    throw new BuildError(`screenshots/${name}: no JPEG start-of-frame marker found`);
  }
  throw new BuildError(`screenshots/${name}: neither a PNG nor a JPEG by magic bytes`);
}

// --- 1. validate what this repo holds ------------------------------------------------------------

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const gameDir = requireDir(join(root, 'game'), 'game/');
const shotsDir = requireDir(join(root, 'screenshots'), 'screenshots/');

const gameFiles = walkFiles(gameDir);
const indexHtml = join(gameDir, 'index.html');
if (!existsSync(indexHtml)) throw new BuildError('game/index.html: the game\'s page must sit at the root of game/');
if (gameFiles.length > GAME_MAX_ENTRIES) {
  throw new BuildError(`game/ holds ${gameFiles.length} entries, over the ${GAME_MAX_ENTRIES} allowed`);
}
let gameBytes = 0;
for (const rel of gameFiles) gameBytes += statSync(join(gameDir, rel)).size;
if (gameBytes > GAME_MAX_BYTES) {
  throw new BuildError(`game/ holds ${gameBytes} bytes, over the ${GAME_MAX_BYTES} allowed`);
}

const shotNames = walkFiles(shotsDir);
if (shotNames.length < SCREENSHOT_MIN_COUNT || shotNames.length > SCREENSHOT_MAX_COUNT) {
  throw new BuildError(`screenshots/ holds ${shotNames.length} images; the entry hands in ${SCREENSHOT_MIN_COUNT} to ${SCREENSHOT_MAX_COUNT}, the first by name the cover`);
}
const shots = [];
for (const name of shotNames) {
  const bytes = readFileSync(join(shotsDir, name));
  if (bytes.length > SCREENSHOT_MAX_BYTES) {
    throw new BuildError(`screenshots/${name} is ${bytes.length} bytes, over the ${SCREENSHOT_MAX_BYTES} a screenshot may be`);
  }
  const { width, height } = imageDimensions(bytes, name);
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long > SCREENSHOT_LONG_SIDE || short < SCREENSHOT_SHORT_SIDE) {
    throw new BuildError(`screenshots/${name} is ${width}x${height}; the long side is at most ${SCREENSHOT_LONG_SIDE} and the short at least ${SCREENSHOT_SHORT_SIDE}`);
  }
  shots.push({ name, bytes: bytes.length, width, height, sha256: sha256(bytes) });
}

// shots.json: the scene list the capture tool drives, kept next to the screenshots as the
// record of which URL state produced which frame.
const shotsJsonPath = join(root, 'shots.json');
if (existsSync(shotsJsonPath)) {
  const scenes = JSON.parse(readFileSync(shotsJsonPath, 'utf8'));
  if (!Array.isArray(scenes) || scenes.length !== shots.length) {
    throw new BuildError(`shots.json lists ${Array.isArray(scenes) ? scenes.length : 'non-array'} scenes for ${shots.length} screenshots`);
  }
}

console.log(`entry: Marisol Bay — an original open-world coastal caper`);
console.log(`game/: ${gameFiles.length} files, ${(gameBytes / 1024).toFixed(1)} KiB`);
for (const shot of shots) {
  const role = shot === shots[0] ? ' (cover)' : '';
  console.log(`screenshot: ${shot.name} ${shot.width}x${shot.height}, ${(shot.bytes / 1024).toFixed(1)} KiB${role}`);
}

// --- 2. copy game/ and screenshots/ into the output directory, deterministically -----------------

const outputDir = process.env.MAKEFUN_OUTPUT_DIR ? resolve(process.env.MAKEFUN_OUTPUT_DIR) : '/output';
mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true, verbatimSymlinks: false });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

// --- 3. the dossier, written by the unchanged kit library ----------------------------------------

const dossier = buildDossier(root, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: SCREENSHOT_MAX_COUNT, max_bytes: SCREENSHOT_MAX_BYTES },
  game_max_files: GAME_MAX_ENTRIES,
  game_max_bytes: GAME_MAX_BYTES,
});
const dossierBytes = Buffer.from(dossier);
if (dossierBytes.length > DOSSIER_MAX_BYTES) {
  throw new BuildError(`dossier.json is ${dossierBytes.length} bytes, over the library's own ${DOSSIER_MAX_BYTES}`);
}
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);

// --- 4. the manifest: sha256 of every handed-in file, for the determinism check -------------------

const manifest = { entry: 'marisol-bay', files: {} };
for (const rel of walkFiles(outputDir)) {
  manifest.files[rel] = sha256(readFileSync(join(outputDir, rel)));
}
writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const outEntries = walkFiles(outputDir).length;
const outBytes = walkFiles(outputDir).reduce((sum, rel) => sum + statSync(join(outputDir, rel)).size, 0);
if (outEntries > OUTPUT_MAX_ENTRIES || outBytes > OUTPUT_MAX_BYTES) {
  throw new BuildError(`/output holds ${outEntries} entries and ${outBytes} bytes; the caps are ${OUTPUT_MAX_ENTRIES} and ${OUTPUT_MAX_BYTES}`);
}

console.log(`dossier.json: ${(dossierBytes.length / 1024).toFixed(1)} KiB of canonical dossier`);
console.log(`output: ${outputDir} — ${outEntries} files, ${(outBytes / 1024).toFixed(1)} KiB, manifest.json with sha256 of each`);
