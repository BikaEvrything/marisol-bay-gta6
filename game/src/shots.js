// The staged scenes behind ?shot=cover|city|drive|mission: each one builds a fresh world from a
// fixed seed, arranges the systems the frame should show (traffic, police, an active mission),
// then plays the real rules forward for a fixed number of ticks under a small autopilot, so the
// same URL always paints the same frame and every screenshot is a genuine render of the game.

import { STEP } from './config.js';
import { startMission } from './missions.js';

const SETUPS = {
  // The cover: driving fast down the coast road with a pursuit on, a mission running and the
  // whole HUD — the most systems in one honest frame.
  cover: {
    seed: 20261117,
    steps: 95,
    arrange(world) {
      // On the coast road heading north, mid-pursuit.
      world.player.x = 6.5 * 96;
      world.player.y = 22 * 96;
      const car = world.vehicles.find((v) => v.parked);
      car.x = world.player.x;
      car.y = world.player.y;
      car.angle = -Math.PI / 2;
      car.speed = 200;
      car.parked = false;
      car.type = 'sports';
      car.factor = 1.2;
      car.colour = '#e05b5b';
      // A clean getaway lane: nothing parked along the coast road in view.
      world.vehicles = world.vehicles.filter((v) => v === car || !(v.parked && v.x > 5 * 96 && v.x < 7 * 96 && v.y > 1000 && v.y < 2600));
      world.player.inVehicle = true;
      world.player.vehicle = car;
      world.wanted = 3;
      for (let k = 0; k < 2; k++) {
        world.police.push({
          id: 900 + k,
          active: true,
          x: world.player.x + 24 + k * 30,
          y: world.player.y + 170 + k * 130,
          angle: -Math.PI / 2,
          speed: 260,
          chasing: true,
          sirenPhase: k,
        });
      }
      // Mission 4 (Hot Cargo) running, already mid-chase: the objective is to lose the heat.
      world.missions.index = 3;
      startMission(world.missions, world);
      world.missions.active.step = 1;
      world.missions.active.timeLeft = Infinity;
      void world.city;
    },
    autopilot(world, input) {
      input.inject({ throttle: 1, steer: 0, handbrake: false, actions: 0 });
      void world;
    },
    // The getaway car is faster than the cruisers, so after the run the pursuit has fallen
    // well behind the frame. The scene stages the chase mid-close: two cruisers tucked into
    // the camera band behind the car (the camera looks ahead by 0.42 of the car's speed and
    // widens to 0.86 zoom above 200 speed), sirens up, everything else as the sim left it.
    finalize(world) {
      const car = world.player.vehicle;
      const camY = car.y - 0.42 * car.speed; // the renderer's own camera target
      const band = 360 / 0.86; // half the view height at the drive zoom
      const cops = world.police.filter((c) => c.active);
      const pair = cops.slice(0, 2);
      while (pair.length < 2) {
        const cop = {
          id: 901 + pair.length,
          active: true,
          x: car.x,
          y: camY + band * 0.55,
          angle: -Math.PI / 2,
          speed: 300,
          chasing: true,
          sirenPhase: pair.length,
        };
        world.police.push(cop);
        pair.push(cop);
      }
      pair[0].x = car.x + 30;
      pair[0].y = camY + band * 0.58;
      pair[1].x = car.x - 36;
      pair[1].y = camY + band * 0.8;
      for (const cop of pair) {
        cop.active = true;
        cop.angle = -Math.PI / 2;
        cop.speed = 300;
        cop.chasing = true;
      }
      // Everything else the auto-spawner put out of sight retires; the staged pair is the chase.
      for (const cop of world.police) if (cop.active && !pair.includes(cop)) cop.active = false;
    },
  },
  // On foot in the dense centre: traffic passing, pedestrians on the sidewalks, HUD up.
  city: {
    seed: 40418,
    steps: 240,
    arrange(world) {
      world.player.x = world.city.places.downtownAlley.x + 60;
      world.player.y = world.city.places.downtownAlley.y + 40;
      world.player.facing = -Math.PI / 2;
    },
    autopilot(world, input) {
      input.inject({ throttle: 0, steer: 0, handbrake: false, actions: 0 });
      void world;
    },
  },
  // Cruising the coast road with traffic around: the drive itself.
  drive: {
    seed: 771,
    steps: 240,
    arrange(world) {
      world.player.x = 6.5 * 96;
      world.player.y = 30 * 96;
      const car = world.vehicles[world.vehicles.length - 1];
      car.x = world.player.x;
      car.y = world.player.y;
      car.angle = -Math.PI / 2;
      car.speed = 190;
      car.type = 'sports';
      car.factor = 1.15;
      car.colour = '#5bb8c9';
      car.parked = false;
      world.player.inVehicle = true;
      world.player.vehicle = car;
      // Company on the coast road: a taxi ahead in the far lane and one following behind.
      const company = [
        { dy: -120, dx: 24, colour: '#f2c53d', type: 'taxi' },
        { dy: 300, dx: -24, colour: '#f2c53d', type: 'taxi' },
        { dy: -420, dx: 24, colour: '#67c98d', type: 'sedan' },
      ];
      for (let k = 0; k < company.length; k++) {
        const other = company[k];
        world.vehicles.push({
          id: 700 + k,
          kind: 'traffic',
          type: other.type,
          factor: 0.95,
          colour: other.colour,
          x: world.player.x + other.dx,
          y: world.player.y + other.dy,
          angle: -Math.PI / 2,
          speed: 150,
          tag: null,
          npc: true,
          parked: false,
          node: null,
          prev: null,
          colourTaxi: other.type === 'taxi',
        });
      }
      world.vehicles = world.vehicles.filter((v) => v === car || !v.parked || !(v.x > 5 * 96 && v.x < 7 * 96 && v.y > 1800 && v.y < 3200));
    },
    autopilot(world, input) {
      // Hold a readable cruise rather than flat-out: the street stays in frame.
      const speed = world.player.vehicle.speed;
      input.inject({ throttle: speed < 195 ? 1 : 0, steer: 0, handbrake: false, actions: 0 });
    },
  },
  // The mission panel and marker: meeting Rosa at the café, marker glowing, minimap pointing.
  mission: {
    seed: 90210,
    steps: 160,
    arrange(world) {
      world.player.x = world.city.places.rosaCafe.x + 150;
      world.player.y = world.city.places.rosaCafe.y + 90;
      world.player.facing = Math.PI * 0.75;
    },
    autopilot(world, input) {
      input.inject({ throttle: 0, steer: 0, handbrake: false, actions: 0 });
      void world;
    },
  },
};

/**
 * Runs the scene named `name` to completion and reports when its final frame is painted:
 * main.js calls this instead of its normal loop, paints twice, then sets window.__shotReady.
 */
export function stageShot(name, deps) {
  const setup = SETUPS[name];
  if (!setup) return null;
  const world = deps.createWorld(setup.seed);
  setup.arrange(world);
  // Let the arrange step register the mission offer marker, then start the offered mission
  // directly when the scene wants one running (the cover's story beat).
  void deps;
  return {
    world,
    run(worldArg, input) {
      for (let k = 0; k < setup.steps; k++) {
        setup.autopilot(worldArg, input);
        worldArg.step(STEP, input.axis(), input.takeActions());
        input.takePointer();
      }
      setup.finalize?.(worldArg);
    },
  };
}

export const SHOT_NAMES = Object.keys(SETUPS);
