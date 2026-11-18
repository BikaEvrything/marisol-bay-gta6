// The story of Marisol Bay, told through six missions plus an endless courier gig afterwards.
// This module holds the mission definitions and the rules of a step (what completes it, what it
// adds to the world when it starts); the world calls `evaluate` every tick and reacts to the
// events it gets back. No mission knows about screens, sound or drawing.

import { STEP } from './config.js';

/**
 * Step kinds:
 *   goto    — reach the point on foot or by car
 *   getcar  — be driving the vehicle with the given tag (spawned by the world when the step starts)
 *   driveTo — drive to the point while in any vehicle, with an optional time limit
 *   evade   — lose the police (wanted level back to zero)
 *   collect — reach each point of `points` in turn
 * A step with `time` counts down once it is the active step; running out fails the mission.
 * A step with `wanted` raises the heat that far the moment it becomes active.
 */
export const MISSIONS = [
  {
    id: 'first-light',
    title: 'First Light',
    from: 'Rosa Delgado',
    giver: 'rosaCafe',
    brief: 'Rosa runs half of Old Marisol out of her café. Show up and she will have work for you.',
    reward: 150,
    steps: [
      { kind: 'goto', at: 'rosaCafe', text: 'Meet Rosa at her café in Old Marisol' },
      { kind: 'getcar', tag: 'courier', text: 'Take the yellow courier van parked outside' },
      { kind: 'driveTo', at: 'docksGarage', text: 'Deliver the van to the Dockside garage', time: 130 },
    ],
  },
  {
    id: 'cooler-run',
    title: 'Beach Cooler Run',
    from: 'Rosa Delgado',
    giver: 'rosaCafe',
    brief: 'A cooler of something cold for the lifeguards, and the tide will not wait.',
    reward: 200,
    steps: [
      { kind: 'goto', at: 'beachKiosk', text: 'Collect the cooler at the beach kiosk' },
      { kind: 'driveTo', at: 'lifeguardHut', text: 'Run the cooler to the lifeguard hut up the shore', time: 95 },
    ],
  },
  {
    id: 'repo-wave',
    title: 'Repo Wave',
    from: 'Mateo Ferrer',
    giver: 'docksGarage',
    brief: 'A teal convertible in Lavanda Heights, three payments behind. Mateo wants it back at the docks.',
    reward: 300,
    steps: [
      { kind: 'goto', at: 'docksGarage', text: 'See Mateo at the Dockside garage' },
      { kind: 'getcar', tag: 'repo', text: 'Repossess the teal convertible in Lavanda Heights' },
      { kind: 'driveTo', at: 'docksGarage', text: 'Bring the convertible back to the garage', time: 150 },
    ],
  },
  {
    id: 'hot-cargo',
    title: 'Hot Cargo',
    from: 'Silas',
    giver: 'downtownAlley',
    brief: 'Silas deals in things nobody ships properly. His crate is hot, and so is the street.',
    reward: 400,
    steps: [
      { kind: 'goto', at: 'downtownAlley', text: 'Collect the crate in the Glasspoint alley' },
      { kind: 'evade', text: 'Lose the police heat before moving on', wanted: 2 },
      { kind: 'driveTo', at: 'marinaPier', text: 'Drop the crate at the marina pier', time: 120 },
    ],
  },
  {
    id: 'long-farewell',
    title: 'The Long Farewell',
    from: 'Mateo Ferrer',
    giver: 'docksGarage',
    brief: 'Someone is leaving town by water. Mateo asks you to drive, and says the police are already talking.',
    reward: 500,
    steps: [
      { kind: 'goto', at: 'docksGarage', text: 'Pick Mateo up at the Dockside garage' },
      { kind: 'getcar', tag: 'any', text: 'Get a car — any car — and let Mateo in' },
      { kind: 'driveTo', at: 'marinaPier', text: 'Drive Mateo to the marina pier before the ferry leaves', time: 85, wanted: 1 },
    ],
  },
  {
    id: 'high-tide',
    title: 'High Tide',
    from: 'Rosa Delgado',
    giver: 'rosaCafe',
    brief: 'Three caches, buried across the city by people who are gone now. Rosa wants them found and brought home.',
    reward: 750,
    steps: [
      { kind: 'goto', at: 'rosaCafe', text: 'Meet Rosa one last time at the café' },
      { kind: 'collect', points: ['cacheA', 'cacheB', 'cacheC'], text: 'Recover the three caches', time: 400 },
      { kind: 'goto', at: 'rosaCafe', text: 'Bring everything back to Rosa' },
    ],
  },
];

/** Pickup and drop-off pools for the endless courier gigs after the story. */
const GIG_SPOTS = ['docksGarage', 'downtownAlley', 'lifeguardHut', 'heightsSpot', 'rosaCafe', 'beachKiosk'];

export function createMissionState() {
  return { index: 0, active: null, gigs: 0 };
}

/** The mission waiting at its giver's marker, or a generated courier gig once the story is done. */
export function offeredMission(state) {
  if (state.index < MISSIONS.length) return MISSIONS[state.index];
  return null;
}

/** Whether the story is finished (the marker then offers courier gigs instead). */
export function storyDone(state) {
  return state.index >= MISSIONS.length;
}

export function startMission(state, world) {
  const index = state.index;
  let def;
  if (index < MISSIONS.length) {
    def = MISSIONS[index];
  } else {
    state.gigs += 1;
    const first = GIG_SPOTS[index % GIG_SPOTS.length];
    const last = GIG_SPOTS[(index * 3 + 1) % GIG_SPOTS.length];
    def = {
      id: `gig-${state.gigs}`,
      title: 'Courier Run',
      from: 'Marisol Couriers',
      brief: 'A parcel that has to be somewhere. The dispatcher does not ask questions.',
      reward: 120,
      steps: [
        { kind: 'goto', at: first, text: 'Collect the parcel' },
        { kind: 'driveTo', at: last, text: 'Deliver the parcel', time: 150 },
      ],
    };
  }
  state.active = { def, step: 0, timeLeft: Infinity, collected: [] };
  return { def, effects: beginStep(state, world, 0) };
}

/** Effects of a step starting: the heat it raises, vehicles it asks the world to spawn. */
function beginStep(state, world, stepIndex) {
  const step = state.active.def.steps[stepIndex];
  state.active.timeLeft = step.time ?? Infinity;
  state.active.collected = [];
  const effects = [];
  if (step.wanted !== undefined) effects.push({ type: 'wanted', value: step.wanted });
  if (step.kind === 'getcar' && step.tag !== 'any') {
    effects.push({ type: 'spawnTagged', tag: step.tag, at: spawnSpotFor(step.tag, world) });
  }
  return effects;
}

function spawnSpotFor(tag, world) {
  const near = tag === 'courier' ? { x: world.city.places.rosaCafe.x + 120, y: world.city.places.rosaCafe.y + 60 } : tag === 'repo' ? { ...world.city.places.heightsSpot } : { x: world.player.x, y: world.player.y };
  // Parked on the street, never inside a building: snap to the nearest open ground.
  return world.city.nearestWalkable(near.x, near.y);
}

/**
 * One tick of mission logic. Returns the events the world must react to:
 *   {type:'advance'} — move to the next step
 *   {type:'complete', reward} — the mission finished
 *   {type:'fail'} — the clock ran out
 */
export function evaluate(state, world) {
  const events = [];
  if (!state.active) return events;
  const active = state.active;
  const step = active.def.steps[active.step];
  // While driving, the vehicle is where the player is: every check follows the focus point.
  const focus = world.player.inVehicle ? world.player.vehicle : world.player;
  const place = world.city.places[step.at ?? 'rosaCafe'];
  const dx = focus.x - place.x;
  const dy = focus.y - place.y;

  if (active.timeLeft !== Infinity) {
    active.timeLeft -= STEP;
    if (active.timeLeft <= 0) {
      events.push({ type: 'fail' });
      return events;
    }
  }

  let done = false;
  if (step.kind === 'goto' || step.kind === 'driveTo') {
    const inVehicle = world.player.inVehicle;
    done = Math.hypot(dx, dy) < 44 && (step.kind === 'goto' || inVehicle);
  } else if (step.kind === 'getcar') {
    done = world.player.inVehicle && (step.tag === 'any' || world.player.vehicle.tag === step.tag);
  } else if (step.kind === 'evade') {
    done = world.wanted === 0;
  } else if (step.kind === 'collect') {
    const points = step.points;
    const at = active.collected.length;
    if (at < points.length) {
      const at2 = world.city.places[points[at]];
      if (Math.hypot(focus.x - at2.x, focus.y - at2.y) < 40) {
        active.collected.push(points[at]);
        events.push({ type: 'collected', index: at });
      }
    }
    done = active.collected.length >= points.length;
  }

  if (done) {
    if (active.step + 1 < active.def.steps.length) {
      active.step += 1;
      events.push(...beginStep(state, world, active.step));
      events.push({ type: 'advance', step: active.step, text: stepText(active.def, active.step) });
    } else {
      events.push({ type: 'complete', reward: active.def.reward, title: active.def.title });
    }
  }
  return events;
}

export function stepText(def, stepIndex) {
  const step = def.steps[stepIndex];
  if (!step) return def.brief;
  if (step.kind === 'collect') {
    const n = step.points.length;
    return `${step.text} (0/${n})`;
  }
  return step.text;
}

export function collectProgress(state) {
  if (!state.active) return null;
  const step = state.active.def.steps[state.active.step];
  if (!step || step.kind !== 'collect') return null;
  return { done: state.active.collected.length, total: step.points.length };
}

/** Where the current marker stands: the giver when idle, else the active step's point. */
export function currentMarker(state, city) {
  if (state.active) {
    const step = state.active.def.steps[state.active.step];
    if (step.kind === 'collect') {
      const points = step.points;
      const at = Math.min(state.active.collected.length, points.length - 1);
      return { ...city.places[points[at]], kind: 'step' };
    }
    if (step.at) return { ...city.places[step.at], kind: 'step' };
    return null;
  }
  const def = offeredMission(state);
  if (!def) return null;
  return { ...city.places[def.giver], kind: 'offer' };
}

export function objectiveLine(state, world) {
  if (state.active) {
    const step = state.active.def.steps[state.active.step];
    let text = stepText(state.active.def, state.active.step);
    const progress = collectProgress(state);
    if (progress) text = `${step.text} (${progress.done}/${progress.total})`;
    if (state.active.timeLeft !== Infinity) {
      const seconds = Math.max(0, Math.ceil(state.active.timeLeft));
      text += `  ·  ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    void world;
    return { title: state.active.def.title, text };
  }
  const def = offeredMission(state);
  if (!def) return { title: 'FREE ROAM', text: 'The city is yours. Courier gigs still pay at the yellow markers.' };
  return { title: `NEW JOB — ${def.title}`, text: `Meet ${def.from} at the marker.` };
}

export function failMission(state) {
  state.active = null;
}
