// The city of Marisol Bay: a seeded generator that lays out the street grid, the sea, the beach,
// the districts and their buildings, the palms and the pier; and the queries everything else asks
// of it (what is solid here, where can a car spawn, what district is this). It holds no entities
// and does no drawing: the renderer and the simulator read its plain data.

import { BEACH_COLS, COLS, DISTRICTS, ROWS, TILE, WATER_COLS, CITY_COL, WORLD } from './config.js';
import { intOf, pickOf } from './rng.js';

const NORTH = 0;
const EAST = 1;
const SOUTH = 2;
const WEST = 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function createCity(random) {
  // --- the street grid: every road is a pair of tiles, listed by the pair's first column/row.
  const vx = [CITY_COL];
  for (let c = CITY_COL + 4 + intOf(random, 3); c <= 44; c += 4 + intOf(random, 3)) vx.push(c);
  const hy = [];
  for (let r = 2 + intOf(random, 2); r <= 33; r += 4 + intOf(random, 3)) hy.push(r);

  const vSet = new Set();
  for (const c of vx) {
    vSet.add(c);
    vSet.add(c + 1);
  }
  const hSet = new Set();
  for (const r of hy) {
    hSet.add(r);
    hSet.add(r + 1);
  }

  const types = new Uint8Array(COLS * ROWS);
  // 0 block, 1 road, 2 water, 3 sand
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let kind = 0;
      if (col < WATER_COLS) kind = 2;
      else if (col < CITY_COL) kind = 3;
      else if (vSet.has(col) || hSet.has(row)) kind = 1;
      types[row * COLS + col] = kind;
    }
  }

  const isRoadTile = (col, row) => types[row * COLS + col] === 1;
  const isWaterTile = (col, row) => types[row * COLS + col] === 2;
  const isSandTile = (col, row) => types[row * COLS + col] === 3;

  // --- blocks: the rectangles of city left between the road pairs.
  const xRanges = [];
  let cursor = CITY_COL + 2;
  for (const c of vx) {
    if (c - cursor >= 1) xRanges.push([cursor, c - 1]);
    cursor = c + 2;
  }
  if (cursor <= COLS - 1) xRanges.push([cursor, COLS - 1]);
  const yRanges = [];
  cursor = 0;
  for (const r of hy) {
    if (r - cursor >= 1) yRanges.push([cursor, r - 1]);
    cursor = r + 2;
  }
  if (cursor <= ROWS - 1) yRanges.push([cursor, ROWS - 1]);

  const blocks = [];
  for (let bj = 0; bj < yRanges.length; bj++) {
    for (let bi = 0; bi < xRanges.length; bi++) {
      const [c0, c1] = xRanges[bi];
      const [r0, r1] = yRanges[bj];
      const midCol = (c0 + c1) / 2;
      const midRow = (r0 + r1) / 2;
      let district = 0;
      if (c0 <= CITY_COL + 3) district = 0;
      else if (midRow < ROWS * 0.42) district = midCol < 30 ? 1 : 2;
      else district = midCol < 27 ? 3 : 4;
      blocks.push({ c0, c1, r0, r1, bi, bj, district, park: false });
    }
  }

  // A few parks: grass and palms instead of buildings.
  const parkCount = 3;
  for (let k = 0; k < parkCount; k++) {
    const block = pickOf(random, blocks.filter((b) => b.district !== 0 && b.c1 - b.c0 >= 2 && b.r1 - b.r0 >= 2));
    if (block) block.park = true;
  }

  // --- buildings, one list the renderer walks; each with a facade colour, a roof colour and a
  // pseudo-3D height factor from its district.
  const buildings = [];
  const trees = [];
  const blockHasBuildings = new Set();
  for (const block of blocks) {
    const style = DISTRICTS[block.district];
    const inset = (side) => side; // one sidewalk tile around every block
    const x0 = (block.c0 + inset(1)) * TILE;
    const y0 = (block.r0 + inset(1)) * TILE;
    const x1 = (block.c1 + 1 - inset(1)) * TILE;
    const y1 = (block.r1 + 1 - inset(1)) * TILE;
    if (block.park) {
      const count = 3 + intOf(random, 3);
      for (let k = 0; k < count; k++) {
        trees.push({
          x: x0 + 26 + random() * Math.max(8, x1 - x0 - 52),
          y: y0 + 26 + random() * Math.max(8, y1 - y0 - 52),
          palm: random() < 0.6,
        });
      }
      continue;
    }
    const colsN = 1 + intOf(random, 2);
    const rowsN = 1 + intOf(random, 2);
    const gap = 14 + intOf(random, 12);
    const cellW = (x1 - x0 - (colsN - 1) * gap) / colsN;
    const cellH = (y1 - y0 - (rowsN - 1) * gap) / rowsN;
    for (let cj = 0; cj < rowsN; cj++) {
      for (let ci = 0; ci < colsN; ci++) {
        const w = cellW - (ci === colsN - 1 ? 0 : intOf(random, Math.max(1, cellW * 0.25)));
        const h = cellH - (cj === rowsN - 1 ? 0 : intOf(random, Math.max(1, cellH * 0.25)));
        if (w < 34 || h < 34) continue;
        buildings.push({
          x: x0 + ci * (cellW + gap),
          y: y0 + cj * (cellH + gap),
          w,
          h,
          wall: pickOf(random, style.wall),
          roof: pickOf(random, style.roof),
          height: style.height * (0.75 + random() * 0.5),
          district: block.district,
          win: random() < 0.85,
        });
        blockHasBuildings.add(block);
      }
    }
    // A lot that ended up empty reads as bare dirt: give it a little parking-lot life.
    if (!blockHasBuildings.has(block)) {
      const count = 2 + intOf(random, 3);
      for (let k = 0; k < count; k++) {
        trees.push({
          x: x0 + 24 + random() * Math.max(8, x1 - x0 - 48),
          y: y0 + 24 + random() * Math.max(8, y1 - y0 - 48),
          palm: random() < 0.7,
        });
      }
    }
  }

  // Palms along the beach and the coast road sidewalks.
  for (let row = 1; row < ROWS - 1; row += 2) {
    if (random() < 0.55) {
      trees.push({ x: (CITY_COL - 0.55) * TILE, y: row * TILE + 20 + random() * 56, palm: true });
    }
    if (random() < 0.4) {
      trees.push({ x: (CITY_COL + 2.2) * TILE + random() * 30, y: row * TILE + 20 + random() * 56, palm: true });
    }
  }

  // The pier: a wooden walk reaching into the sea near the marina.
  const pierRow = 4 + intOf(random, 3);
  const pier = { x0: 0, x1: WATER_COLS * TILE, y0: pierRow * TILE + 8, y1: pierRow * TILE + TILE - 8 };

  // --- the traffic graph: one node at the centre of every road-pair crossing.
  const nodeX = vx.map((c) => c * TILE + TILE);
  const nodeY = hy.map((r) => r * TILE + TILE);

  const solidAt = (x, y) => {
    if (x < 0 || y < 0 || x >= WORLD.width || y >= WORLD.height) return true;
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    const kind = types[row * COLS + col];
    if (kind === 1 || kind === 3) return false;
    if (kind === 2) return true;
    // A block tile is solid unless its block is a park.
    const bi = xRanges.findIndex(([a, b]) => col >= a && col <= b);
    const bj = yRanges.findIndex(([a, b]) => row >= a && row <= b);
    if (bi < 0 || bj < 0) return false;
    const block = blocks.find((b) => b.bi === bi && b.bj === bj);
    return block ? !block.park : false;
  };

  const districtIndexAt = (x, y) => {
    if (x < (CITY_COL + 2) * TILE) return 0;
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    let best = 0;
    for (const block of blocks) {
      if (col >= block.c0 - 1 && col <= block.c1 + 1 && row >= block.r0 - 1 && row <= block.r1 + 1) best = block.district;
    }
    return best;
  };

  /** The nearest point a walker can stand on, searched in rings around (x, y). */
  const nearestWalkable = (x, y) => {
    for (let ring = 0; ring < 40; ring++) {
      const samples = ring === 0 ? 1 : ring * 8;
      for (let k = 0; k < samples; k++) {
        const step = ring === 0 ? 0 : (k / samples) * Math.PI * 2;
        const px = x + Math.cos(step) * ring * TILE * 0.5;
        const py = y + Math.sin(step) * ring * TILE * 0.5;
        if (!solidAt(px, py) && !isSandTile(Math.floor(px / TILE), Math.floor(py / TILE))) return { x: px, y: py };
      }
    }
    return { x, y };
  };

  /** A random spot on a road lane, with a heading along it — for traffic and police spawns. */
  const randomRoadSpawn = () => {
    const vertical = random() < 0.5;
    if (vertical) {
      const c = pickOf(random, vx);
      const y = random() * WORLD.height;
      const south = random() < 0.5;
      return { x: (c + (south ? 0.5 : 1.5)) * TILE, y, dir: south ? SOUTH : NORTH };
    }
    const r = pickOf(random, hy);
    const x = random() * WORLD.width;
    const west = random() < 0.5;
    return { x, y: (r + (west ? 1.5 : 0.5)) * TILE, dir: west ? WEST : EAST };
  };

  /** A random sidewalk point: a block-edge tile of some block, inset toward the kerb. */
  const randomSidewalkPoint = () => {
    for (let tries = 0; tries < 50; tries++) {
      const block = pickOf(random, blocks);
      const onTop = random() < 0.5;
      const col = block.c0 + intOf(random, block.c1 - block.c0 + 1);
      const row = onTop ? block.r0 : block.r1;
      if (!isRoadTile(col, row)) {
        return { x: col * TILE + 24 + random() * (TILE - 48), y: row * TILE + (onTop ? 18 : TILE - 18) };
      }
    }
    return { x: WORLD.width / 2, y: WORLD.height / 2 };
  };

  /** The nearest point on a road tile, searched in rings: mission spots must be drivable. */
  const nearestRoadPoint = (x, y) => {
    for (let ring = 0; ring < 40; ring++) {
      const samples = ring === 0 ? 1 : ring * 8;
      for (let k = 0; k < samples; k++) {
        const step = ring === 0 ? 0 : (k / samples) * Math.PI * 2;
        const px = x + Math.cos(step) * ring * TILE * 0.5;
        const py = y + Math.sin(step) * ring * TILE * 0.5;
        const col = Math.floor(px / TILE);
        const row = Math.floor(py / TILE);
        if (isRoadTile(col, row)) return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
      }
    }
    return nearestWalkable(x, y);
  };

  // Named places the story and the police use. Job spots sit on roads so any car reaches them;
  // the beach spots sit on the sand by design.
  const coastRoadX = (CITY_COL + 1) * TILE;
  const places = {
    playerStart: nearestRoadPoint(14 * TILE + 40, 26 * TILE + 48),
    policeStation: nearestRoadPoint(30 * TILE + 48, 10 * TILE + 48),
    rosaCafe: nearestRoadPoint(13 * TILE + 48, 24 * TILE + 48),
    beachKiosk: { x: (CITY_COL - 1.2) * TILE, y: 9 * TILE + 20 },
    lifeguardHut: { x: (CITY_COL - 1.2) * TILE, y: 21 * TILE + 30 },
    docksGarage: nearestRoadPoint(40 * TILE + 48, 30 * TILE + 48),
    heightsSpot: nearestRoadPoint((CITY_COL + 7) * TILE + 60, 8 * TILE + 48),
    downtownAlley: nearestRoadPoint(24 * TILE + 48, 7 * TILE + 48),
    marinaPier: { x: coastRoadX, y: pierRow * TILE + TILE / 2 },
    cacheA: nearestRoadPoint(20 * TILE, 4 * TILE),
    cacheB: nearestRoadPoint(44 * TILE, 16 * TILE),
    cacheC: nearestRoadPoint(30 * TILE, 34 * TILE),
  };

  return {
    vx,
    hy,
    nodeX,
    nodeY,
    blocks,
    buildings,
    trees,
    pier,
    types,
    isRoadTile,
    isWaterTile,
    isSandTile,
    solidAt,
    districtIndexAt,
    nearestWalkable,
    nearestRoadPoint,
    randomRoadSpawn,
    randomSidewalkPoint,
    places,
    districtCount: DISTRICTS.length,
  };
}
