// Every tuning number, dimension and colour in one place. The world is measured in tiles of
// 96 px; the camera shows a fixed 1280x720 logical view that the renderer scales to the window,
// so nothing below depends on the real screen size.

export const TILE = 96;
export const COLS = 50;
export const ROWS = 38;
export const WORLD = { width: COLS * TILE, height: ROWS * TILE };

/** The sea sits along the west edge: water, then a beach strip, then the coast road. */
export const WATER_COLS = 3;
export const BEACH_COLS = 2;
/** First city column (the coast road's pair starts here). */
export const CITY_COL = WATER_COLS + BEACH_COLS;

/** The simulation's fixed step: 60 updates a second whatever the display does. */
export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  walk: 165,
  sprint: 240,
  radius: 11,
  enterRange: 52,
  shoveRange: 42,
  shoveCooldown: 0.55,
  shoveStun: 2.6,
};

export const VEHICLE = {
  maxSpeed: 340,
  reverseMax: 120,
  accel: 300,
  brake: 520,
  drag: 90,
  steer: 2.5,
  handbrakeSteer: 4.2,
  length: 46,
  width: 24,
  exitOffset: 34,
};

export const TRAFFIC = {
  count: 26,
  speed: 150,
  laneOffset: 24,
  followGap: 78,
};

export const PEDS = { count: 46, walk: 46 };

export const POLICE = {
  maxCars: 5,
  speed: 330,
  sightRange: 560,
  evadeTime: 9,
  bustTime: 2.4,
  bustRange: 92,
  starDecay: 9,
  despawn: 900,
};

export const WANTED_GAIN = {
  jackOccupied: 2,
  jackParked: 1,
  hitPed: 1,
  shoveCop: 2,
  ramCop: 1,
  jackPolice: 3,
};

export const ECONOMY = {
  bustedFine: 150,
  startCash: 250,
  pedDrop: 12,
};

export const MARKER = { radius: 34, pulse: 0.5 };

export const SAVE_KEY = 'marisol-bay-save-v1';

/** Districts, in the order the map generator assigns them; each carries its own look. */
export const DISTRICTS = [
  {
    id: 'oceanfront',
    name: 'PALM SHORES',
    wall: ['#f6e2c8', '#f2cfae', '#efd7b6', '#f4d9c0'],
    roof: ['#d97f5e', '#c96d55', '#d98a63', '#cf7a5c'],
    height: 0.9,
    palms: true,
  },
  {
    id: 'downtown',
    name: 'GLASSPOINT',
    wall: ['#9fc4d8', '#8fb4cf', '#a8cbe0', '#9dbcd4'],
    roof: ['#5d7d95', '#54718a', '#66859e', '#5a7a92'],
    height: 2.6,
    palms: false,
  },
  {
    id: 'heights',
    name: 'LAVANDA HEIGHTS',
    wall: ['#dcc6ec', '#d3b8e6', '#e2cbee', '#d8c0e9'],
    roof: ['#8f6fa8', '#8665a0', '#9a79b4', '#8d6ca6'],
    height: 1.2,
    palms: true,
  },
  {
    id: 'oldtown',
    name: 'OLD MARISOL',
    wall: ['#f4d8b0', '#f0cfa4', '#f6ddba', '#f1d2a8'],
    roof: ['#c96a4a', '#bf5f44', '#d37653', '#c46448'],
    height: 1.1,
    palms: true,
  },
  {
    id: 'docks',
    name: 'DOCKSIDE',
    wall: ['#c9c2b2', '#bfb8a6', '#d2cab8', '#c5beac'],
    roof: ['#7d8590', '#747c88', '#878f9a', '#7a828d'],
    height: 1.0,
    palms: false,
  },
];

export const PALETTE = {
  backdrop: '#173a4d',
  water: '#2ea8b8',
  waterDeep: '#1f7f96',
  waterLight: '#57c3ce',
  sand: '#f0d9a4',
  sandDark: '#e3c88f',
  asphalt: '#565d6d',
  asphaltLight: '#616878',
  lanePaint: '#f5e9c8',
  sidewalk: '#cfc2a8',
  sidewalkDark: '#c2b59c',
  grass: '#83bd66',
  grassDark: '#6ea854',
  trunk: '#8a6a4a',
  palm: '#4da96a',
  palmDark: '#3d8f57',
  player: '#ffd166',
  playerShirt: '#ef6f6c',
  ped: ['#e8a0bf', '#9fc3e8', '#b8e0a0', '#f0c987', '#c9b8f0', '#f2a3a0'],
  car: ['#e05b5b', '#5ba3e0', '#e0a35b', '#67c98d', '#c15be0', '#e0d15b', '#5bb8c9', '#d3d7de'],
  police: '#2d4d8f',
  policeStripe: '#e8eef6',
  taxi: '#f2c53d',
  marker: '#ffd166',
  cop: '#7fa8e8',
  shadow: 'rgba(20, 30, 45, 0.25)',
};

/** Body colours traffic and parked cars are painted with. */
export const CAR_COLOURS = PALETTE.car;

/** Vehicle body types, with a speed factor and a colour usage hint for the spawner. */
export const CAR_TYPES = [
  { id: 'sedan', factor: 0.92, weight: 5 },
  { id: 'van', factor: 0.8, weight: 2 },
  { id: 'sports', factor: 1.25, weight: 2 },
  { id: 'taxi', factor: 0.95, weight: 3 },
];

/** Skid-mark and tyre dust tones for the effects layer. */
export const TAPE_COLOURS = ['#e8e2d4', '#f4e8d8', '#d8e2ea'];
