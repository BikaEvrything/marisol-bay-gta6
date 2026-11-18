// The rules and state of Marisol Bay, with no drawing and no browser in it. The world owns the
// player, every vehicle, the pedestrians, the police and the wanted level; step() advances one
// fixed 1/60 s tick given the current input state, and reports nothing — callers read its fields
// and the event hooks it leaves (notifications, mission events) as they need.

import { CAR_TYPES, CAR_COLOURS, ECONOMY, PEDS, PLAYER, POLICE, STEP, TILE, TRAFFIC, VEHICLE, WANTED_GAIN, WORLD } from './config.js';
import { ACTION_ENTER_EXIT, ACTION_HORN, ACTION_SHOVE } from './input.js';
import { intOf, pickOf, rangeOf } from './rng.js';
import { SFX } from './audio.js';
import { createCity } from './city.js';
import { createEffects } from './effects.js';
import { createMissionState, evaluate as evaluateMissions, startMission, failMission, currentMarker, objectiveLine } from './missions.js';

let nextId = 1;

function makeVehicle(type, colour, x, y, angle, opts) {
  const spec = CAR_TYPES.find((t) => t.id === type) ?? CAR_TYPES[0];
  return {
    id: nextId++,
    kind: opts?.kind ?? 'traffic',
    type: spec.id,
    factor: spec.factor,
    colour,
    x,
    y,
    angle,
    speed: 0,
    tag: opts?.tag ?? null,
    npc: opts?.npc ?? false,
    parked: opts?.parked ?? true,
    // Traffic navigation: the node it is heading for, and the one it came from.
    node: opts?.node ?? null,
    prev: opts?.prev ?? null,
    colourTaxi: type === 'taxi',
  };
}

export function createWorld(seed) {
  const random = (() => {
    let a = seed | 0;
    return function random() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  const city = createCity(random);
  const effects = createEffects();
  const missionState = createMissionState();

  const start = city.places.playerStart;
  const player = {
    x: start.x,
    y: start.y,
    facing: 0,
    inVehicle: false,
    vehicle: null,
    shoveCooldown: 0,
    sprinting: false,
  };

  const world = {
    seed,
    random,
    city,
    effects,
    missions: missionState,
    player,
    vehicles: [],
    police: [],
    peds: [],
    wanted: 0,
    evadeTimer: 0,
    bustTimer: 0,
    cash: ECONOMY.startCash,
    time: 0,
    districtSeen: '',
    notes: [],
    marker: null,
    objective: objectiveLine(missionState, null),
    storyDone: false,
    endBanner: null,
    vehiclesEntered: 0,
  };

  // Parked cars around the city: a few along the streets, some in each district.
  for (let k = 0; k < 22; k++) {
    const spot = city.randomRoadSpawn();
    const alongX = spot.dir % 2 === 0;
    const px = spot.x + (alongX ? 46 : 0);
    const py = spot.y + (alongX ? 0 : 46);
    const type = pickOf(random, CAR_TYPES).id;
    world.vehicles.push(makeVehicle(type, pickOf(random, CAR_COLOURS), px, py, (spot.dir * Math.PI) / 2, { parked: true }));
  }
  // Guarantee a car near the start so the first mission is playable immediately.
  world.vehicles.push(makeVehicle('sedan', '#67c98d', start.x + 70, start.y, -Math.PI / 2, { parked: true }));

  function notify(text, colour) {
    world.notes.push({ text, colour: colour ?? '#f5e9c8', life: 3.4 });
    if (world.notes.length > 4) world.notes.shift();
  }

  function wantedAdd(n, reason) {
    const before = world.wanted;
    world.wanted = Math.min(5, world.wanted + n);
    world.evadeTimer = 0;
    if (world.wanted > before) {
      SFX.wanted();
      effects.popup(player.x, player.y - 26, `WANTED ${'★'.repeat(world.wanted)}`, '#ff8d7a');
      if (reason) notify(reason, '#ff8d7a');
    }
  }

  function spawnTraffic() {
    const spot = city.randomRoadSpawn();
    const distance = Math.hypot(spot.x - player.x, spot.y - player.y);
    if (distance < 420 || distance > 1500) return;
    const type = pickOf(random, CAR_TYPES);
    const colour = type.id === 'taxi' ? '#f2c53d' : pickOf(random, CAR_COLOURS);
    const node = nearestNode(spot.x, spot.y);
    world.vehicles.push(makeVehicle(type.id, colour, spot.x, spot.y, (spot.dir * Math.PI) / 2, { npc: true, parked: false, node, prev: node }));
  }

  function nearestNode(x, y) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < city.nodeX.length; i++) {
      for (let j = 0; j < city.nodeY.length; j++) {
        const nx = city.nodeX[i];
        const ny = city.nodeY[j];
        const d = Math.hypot(nx - x, ny - y);
        if (d < bestD) {
          bestD = d;
          best = { i, j };
        }
      }
    }
    return best;
  }

  function nodePoint(i, j) {
    return { x: city.nodeX[i], y: city.nodeY[j] };
  }

  function nextNodeFor(vehicle) {
    const options = [];
    const { i, j } = vehicle.node;
    const straight = directionBetween(vehicle.prev, vehicle.node);
    if (i > 0) options.push({ i: i - 1, j, dir: 3 });
    if (i < city.nodeX.length - 1) options.push({ i: i + 1, j, dir: 1 });
    if (j > 0) options.push({ i, j: j - 1, dir: 0 });
    if (j < city.nodeY.length - 1) options.push({ i, j: j + 1, dir: 2 });
    if (options.length === 0) return null;
    // Prefer going straight; otherwise pick a turn that is not a U-turn.
    const straightish = options.filter((o) => o.dir === straight);
    const pick = (straightish.length && random() < 0.72 ? pickOf(random, straightish) : pickOf(random, options));
    return pick;
  }

  function directionBetween(from, to) {
    if (!from || !to) return 1;
    if (to.i > from.i) return 1;
    if (to.i < from.i) return 3;
    if (to.j > from.j) return 2;
    return 0;
  }

  function updateTraffic(dt) {
    for (const v of world.vehicles) {
      if (v.kind === 'police') continue;
      if (v === player.vehicle) continue; // the player drives this one; traffic never touches it
      const distance = Math.hypot(v.x - player.x, v.y - player.y);
      if (v.npc && distance > 1600) {
        v.dead = true;
        continue;
      }
      if (v.parked || !v.npc) {
        v.speed = 0;
        continue;
      }
      if (!v.node) {
        v.node = nearestNode(v.x, v.y);
        v.prev = v.node;
      }
      // Lane point: the target node offset to the right of the travel direction.
      const from = nodePoint(v.prev.i, v.prev.j);
      const to = nodePoint(v.node.i, v.node.j);
      const seg = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const ux = (to.x - from.x) / seg;
      const uy = (to.y - from.y) / seg;
      const targetX = to.x - uy * TRAFFIC.laneOffset;
      const targetY = to.y + ux * TRAFFIC.laneOffset;
      const want = Math.atan2(targetY - v.y, targetX - v.x);
      v.angle = turnToward(v.angle, want, 2.4 * dt);
      let speed = TRAFFIC.speed * v.factor;
      // Slow for the turn ahead, stop for whoever is in front.
      const left = seg - Math.hypot(v.x - from.x, v.y - from.y);
      if (left < 140 && v.nextTurn) speed = 85;
      for (const other of world.vehicles) {
        if (other === v || other.parked) continue;
        const ox = other.x - v.x;
        const oy = other.y - v.y;
        const ahead = ox * Math.cos(v.angle) + oy * Math.sin(v.angle);
        const side = Math.abs(-ox * Math.sin(v.angle) + oy * Math.cos(v.angle));
        if (ahead > 0 && ahead < TRAFFIC.followGap && side < 26) speed = Math.min(speed, Math.max(0, other.speed * 0.9 + 10));
      }
      const playerCar = player.inVehicle ? player.vehicle : null;
      if (playerCar) {
        const ox = playerCar.x - v.x;
        const oy = playerCar.y - v.y;
        const ahead = ox * Math.cos(v.angle) + oy * Math.sin(v.angle);
        const side = Math.abs(-ox * Math.sin(v.angle) + oy * Math.cos(v.angle));
        if (ahead > 0 && ahead < TRAFFIC.followGap && side < 26) speed = 0;
      }
      v.speed += (speed - v.speed) * Math.min(1, dt * 2.2);
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;
      if (Math.hypot(v.x - targetX, v.y - targetY) < 60) {
        const next = nextNodeFor(v);
        if (next) {
          v.prev = v.node;
          v.node = { i: next.i, j: next.j };
          v.nextTurn = next.dir !== directionBetween(v.prev, v.node);
        }
      }
      if (city.solidAt(v.x + Math.cos(v.angle) * 30, v.y + Math.sin(v.angle) * 30)) {
        v.speed *= 0.4;
      }
    }
    for (let i = world.vehicles.length - 1; i >= 0; i--) if (world.vehicles[i].dead) world.vehicles.splice(i, 1);
  }

  function updatePeds(dt) {
    for (const ped of world.peds) {
      const distance = Math.hypot(ped.x - player.x, ped.y - player.y);
      if (distance > 1100) {
        ped.dead = true;
        continue;
      }
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) ped.down = 0;
        continue;
      }
      const speed = ped.fleeing ? ped.speed * 2.6 : ped.speed;
      const nx = ped.x + Math.cos(ped.dir) * speed * dt;
      const ny = ped.y + Math.sin(ped.dir) * speed * dt;
      const blocked = city.solidAt(nx, ny) || city.isWaterTile(Math.floor(nx / TILE), Math.floor(ny / 96));
      if (blocked) {
        ped.dir = random() * Math.PI * 2;
        ped.timer = rangeOf(random, 0.4, 1.2);
      } else {
        ped.x = nx;
        ped.y = ny;
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.timer = rangeOf(random, 1.2, 4);
          ped.dir += rangeOf(random, -1.6, 1.6);
        }
      }
      if (ped.fleeing) {
        ped.fleeTime -= dt;
        if (ped.fleeTime <= 0) ped.fleeing = false;
      }
    }
    for (let i = world.peds.length - 1; i >= 0; i--) if (world.peds[i].dead) world.peds.splice(i, 1);
    while (world.peds.length < PEDS.count) {
      const spot = city.randomSidewalkPoint();
      const distance = Math.hypot(spot.x - player.x, spot.y - player.y);
      if (distance < 260 || distance > 900) break;
      world.peds.push({
        x: spot.x,
        y: spot.y,
        dir: random() * Math.PI * 2,
        speed: PEDS.walk * (0.7 + random() * 0.6),
        timer: rangeOf(random, 1, 3),
        down: 0,
        colour: intOf(random, 6),
        fleeing: false,
        fleeTime: 0,
      });
    }
  }

  function updatePolice(dt) {
    // Keep as many cruisers as the wanted level demands, spawning out of sight.
    const target = world.wanted === 0 ? 0 : Math.min(POLICE.maxCars, world.wanted + 1);
    let active = world.police.filter((c) => c.active).length;
    if (active < target) {
      const spot = city.randomRoadSpawn();
      const distance = Math.hypot(spot.x - player.x, spot.y - player.y);
      if (distance > 480 && distance < 1200) {
        world.police.push({
          id: nextId++,
          active: true,
          x: spot.x,
          y: spot.y,
          angle: (spot.dir * Math.PI) / 2,
          speed: POLICE.speed,
          chasing: true,
          sirenPhase: random() * 2,
        });
        active += 1;
      }
    }
    for (const cop of world.police) {
      if (!cop.active) continue;
      if (world.wanted === 0) {
        cop.chasing = false;
        cop.retire = (cop.retire ?? 2) - dt;
        if (cop.retire <= 0) cop.active = false;
        cop.speed *= 0.98;
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
        continue;
      }
      const distance = Math.hypot(player.x - cop.x, player.y - cop.y);
      if (distance > POLICE.despawn) {
        cop.active = false;
        continue;
      }
      const targetAngle = Math.atan2(player.y - cop.y, player.x - cop.x);
      // Look ahead: if the road ahead is a wall, swing wide around it.
      const probeX = cop.x + Math.cos(cop.angle) * 70;
      const probeY = cop.y + Math.sin(cop.angle) * 70;
      let steerBias = 0;
      if (city.solidAt(probeX, probeY)) {
        const leftX = cop.x + Math.cos(cop.angle - 0.9) * 70;
        const leftY = cop.y + Math.sin(cop.angle - 0.9) * 70;
        steerBias = city.solidAt(leftX, leftY) ? 1.6 : -1.6;
      }
      const diff = angleDiff(cop.angle, targetAngle);
      cop.angle += clamp(diff, -3.0 * dt, 3.0 * dt) + steerBias * dt;
      const close = distance < 130;
      const targetSpeed = close ? POLICE.speed * 0.55 : POLICE.speed;
      cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.8);
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      if (city.solidAt(nx, ny)) {
        cop.speed *= 0.3;
        effects.dust(cop.x, cop.y, '#cfd6de');
      } else {
        cop.x = nx;
        cop.y = ny;
      }
      // Ramming the player's car: a jolt, no damage model, just physics theatre.
      const car = player.inVehicle ? player.vehicle : null;
      if (car && Math.hypot(car.x - cop.x, car.y - cop.y) < 44) {
        car.speed *= 0.7;
        effects.kick(4);
        effects.dust((car.x + cop.x) / 2, (car.y + cop.y) / 2, '#ffd166');
      }
    }
    for (let i = world.police.length - 1; i >= 0; i--) if (!world.police[i].active) world.police.splice(i, 1);
  }

  function updateWanted(dt) {
    if (world.wanted === 0) return;
    let seen = false;
    for (const cop of world.police) {
      if (cop.active && cop.chasing && Math.hypot(cop.x - player.x, cop.y - player.y) < POLICE.sightRange) seen = true;
    }
    if (seen) world.evadeTimer = 0;
    else {
      world.evadeTimer += dt;
      if (world.evadeTimer >= POLICE.starDecay) {
        world.evadeTimer = 0;
        world.wanted -= 1;
        if (world.wanted === 0) notify('The heat is off. Drive steady.', '#9fd8a8');
        else effects.popup(player.x, player.y - 26, `WANTED ${'★'.repeat(world.wanted)}`, '#ff8d7a');
      }
    }
    // Busted: stopped or on foot with a cruiser looming.
    let looming = false;
    for (const cop of world.police) {
      if (!cop.active) continue;
      const d = Math.hypot(cop.x - player.x, cop.y - player.y);
      if (d < POLICE.bustRange) {
        const still = !player.inVehicle || Math.abs(player.vehicle.speed) < 40;
        if (still) looming = true;
      }
    }
    if (looming) {
      world.bustTimer += dt;
      if (world.bustTimer >= POLICE.bustTime) busted();
    } else world.bustTimer = Math.max(0, world.bustTimer - dt * 2);
  }

  function busted() {
    const fine = Math.min(ECONOMY.bustedFine, world.cash);
    world.cash -= fine;
    world.wanted = 0;
    world.bustTimer = 0;
    for (const cop of world.police) cop.active = false;
    SFX.busted();
    effects.punch();
    effects.banner('BUSTED', fine > 0 ? `Fine paid: $${fine}` : 'Released with a warning', '#ff8d7a', 3);
    if (player.inVehicle) exitVehicle(true);
    const station = city.places.policeStation;
    player.x = station.x;
    player.y = station.y;
    if (world.missions.active) {
      failMission(world.missions);
      notify('The job fell through while you were in custody.', '#ff8d7a');
    }
  }

  function exitVehicle(forced) {
    const v = player.vehicle;
    if (!v) return;
    if (!forced && Math.abs(v.speed) > 60) return;
    const side = v.angle + Math.PI / 2;
    let px = v.x + Math.cos(side) * VEHICLE.exitOffset;
    let py = v.y + Math.sin(side) * VEHICLE.exitOffset;
    if (city.solidAt(px, py)) {
      px = v.x - Math.cos(side) * VEHICLE.exitOffset;
      py = v.y - Math.sin(side) * VEHICLE.exitOffset;
    }
    if (city.solidAt(px, py)) {
      px = v.x;
      py = v.y;
    }
    player.x = px;
    player.y = py;
    player.inVehicle = false;
    player.vehicle = null;
    v.npc = false;
    v.parked = true;
  }

  function enterVehicle() {
    let best = null;
    let bestD = PLAYER.enterRange;
    let copTarget = null;
    for (const v of world.vehicles) {
      const d = Math.hypot(v.x - player.x, v.y - player.y);
      if (d < bestD) {
        bestD = d;
        best = v;
        copTarget = null;
      }
    }
    for (const cop of world.police) {
      if (!cop.active) continue;
      const d = Math.hypot(cop.x - player.x, cop.y - player.y);
      if (d < bestD) {
        bestD = d;
        copTarget = cop;
        best = null;
      }
    }
    if (!best && !copTarget) return;
    if (copTarget) {
      // Stealing a cruiser out from under the police: the whole city notices.
      copTarget.active = false;
      const stolen = makeVehicle('sedan', '#2d4d8f', copTarget.x, copTarget.y, copTarget.angle, { parked: false, tag: 'police' });
      world.vehicles.push(stolen);
      player.inVehicle = true;
      player.vehicle = stolen;
      wantedAdd(WANTED_GAIN.jackPolice, 'You stole a police cruiser.');
      effects.puff(copTarget.x, copTarget.y, '#dfe8f2', 8, 70);
      return;
    }
    const occupied = best.npc && !best.parked;
    const wasParked = best.parked;
    best.parked = false;
    best.npc = false;
    player.inVehicle = true;
    player.vehicle = best;
    world.vehiclesEntered += 1;
    if (occupied) {
      wantedAdd(WANTED_GAIN.jackOccupied, 'Grand theft: the driver saw everything.');
      world.peds.push({
        x: best.x,
        y: best.y,
        dir: random() * Math.PI * 2,
        speed: PEDS.walk,
        timer: 3,
        down: 0,
        colour: intOf(random, 6),
        fleeing: true,
        fleeTime: 6,
      });
      effects.puff(best.x, best.y, '#e8e2d4', 8, 60);
    } else if (wasParked && best.tag !== 'courier' && best.tag !== 'repo') {
      wantedAdd(WANTED_GAIN.jackParked, 'Stealing a parked car: someone called it in.');
    } else if (best.tag === 'repo') {
      wantedAdd(WANTED_GAIN.jackParked, 'The repo is yours — now get it to the docks.');
    } else {
      effects.popup(best.x, best.y - 30, 'Nice ride.', '#9fd8a8');
    }
  }

  function updatePlayerOnFoot(dt, axis, actions) {
    const sprint = axis.sprint ? PLAYER.sprint : PLAYER.walk;
    let vx = 0;
    let vy = 0;
    if (axis.throttle > 0) vy -= sprint;
    if (axis.throttle < 0) vy += sprint;
    if (axis.steer < 0) vx -= sprint;
    if (axis.steer > 0) vx += sprint;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      player.facing = Math.atan2(vy, vx);
      vx = (vx / len) * sprint;
      vy = (vy / len) * sprint;
    }
    // Move axis by axis so sliding along walls feels right.
    const r = PLAYER.radius;
    if (!city.solidAt(player.x + vx * dt, player.y) && !(vx > 0 && city.solidAt(player.x + vx * dt + r, player.y)) && !(vx < 0 && city.solidAt(player.x + vx * dt - r, player.y))) player.x += vx * dt;
    if (!city.solidAt(player.x, player.y + vy * dt) && !(vy > 0 && city.solidAt(player.x, player.y + vy * dt + r)) && !(vy < 0 && city.solidAt(player.x, player.y + vy * dt - r))) player.y += vy * dt;
    player.x = Math.max(8, Math.min(WORLD.width - 8, player.x));
    player.y = Math.max(8, Math.min(WORLD.height - 8, player.y));
    player.sprinting = axis.sprint && len > 0;
    if (len > 0 && city.isSandTile(Math.floor(player.x / TILE), Math.floor(player.y / TILE)) && Math.random() < 0.3) {
      effects.dust(player.x, player.y + 8, '#e8d4a8');
    }
    player.shoveCooldown = Math.max(0, player.shoveCooldown - dt);
    if (actions & ACTION_SHOVE) {
      if (player.shoveCooldown === 0) {
        player.shoveCooldown = PLAYER.shoveCooldown;
        SFX.shove();
        effects.puff(player.x + Math.cos(player.facing) * 20, player.y + Math.sin(player.facing) * 20, '#fff4d8', 6, 70);
        let shoved = false;
        for (const ped of world.peds) {
          if (ped.down > 0) continue;
          if (Math.hypot(ped.x - player.x, ped.y - player.y) < PLAYER.shoveRange) {
            ped.down = PLAYER.shoveStun;
            shoved = true;
            if (random() < 0.35) {
              const drop = ECONOMY.pedDrop + intOf(random, 20);
              world.cash += drop;
              effects.popup(ped.x, ped.y - 24, `+$${drop}`, '#ffd166');
              SFX.cash();
            }
          }
        }
        for (const cop of world.police) {
          if (!cop.active) continue;
          if (Math.hypot(cop.x - player.x, cop.y - player.y) < PLAYER.shoveRange + 30) {
            wantedAdd(WANTED_GAIN.shoveCop, 'You shoved a police cruiser. Bold.');
            shoved = true;
          }
        }
        if (!shoved) effects.popup(player.x, player.y - 24, 'Whoosh.', '#d8e2ea');
      }
    }
    if (actions & ACTION_ENTER_EXIT) enterVehicle();
  }

  function updatePlayerDriving(dt, axis, actions) {
    const v = player.vehicle;
    const onSand = city.isSandTile(Math.floor(v.x / TILE), Math.floor(v.y / TILE));
    const sandFactor = onSand ? 0.55 : 1;
    const maxSpeed = VEHICLE.maxSpeed * v.factor * sandFactor;
    if (axis.throttle > 0) v.speed += VEHICLE.accel * dt;
    else if (axis.throttle < 0) v.speed -= (Math.abs(v.speed) > 10 ? VEHICLE.brake : VEHICLE.accel * 0.6) * dt;
    else v.speed -= Math.sign(v.speed) * VEHICLE.drag * dt;
    const handbrake = axis.handbrake;
    if (handbrake) v.speed -= Math.sign(v.speed) * VEHICLE.brake * 1.4 * dt;
    v.speed = clamp(v.speed, -VEHICLE.reverseMax, maxSpeed);
    if (Math.abs(v.speed) < 2) v.speed = 0;
    // Steering authority grows with speed but never disappears: a car nose-deep in a kerb can
    // still pivot free, which is what real drivers expect.
    const steerAuth = 0.35 + 0.65 * clamp(Math.abs(v.speed) / 140, 0, 1);
    const rate = (handbrake ? VEHICLE.handbrakeSteer : VEHICLE.steer) * steerAuth * Math.sign(v.speed || 1);
    v.angle += axis.steer * rate * dt;
    const nx = v.x + Math.cos(v.angle) * v.speed * dt;
    const ny = v.y + Math.sin(v.angle) * v.speed * dt;
    const front = city.solidAt(nx + Math.cos(v.angle) * 22, ny + Math.sin(v.angle) * 22);
    if (front || nx < 20 || nx > WORLD.width - 20 || ny < 20 || ny > WORLD.height - 20) {
      const impact = Math.abs(v.speed);
      if (impact > 90) {
        SFX.crash();
        effects.kick(Math.min(8, impact / 60));
        effects.puff(nx, ny, '#e8e2d4', 8, 90);
      }
      // Nudge the nose back out of whatever it hit, so reversing frees the car.
      v.x -= Math.cos(v.angle) * 2.5;
      v.y -= Math.sin(v.angle) * 2.5;
      v.speed = -v.speed * 0.32;
    } else {
      v.x = nx;
      v.y = ny;
    }
    if (onSand && Math.abs(v.speed) > 60 && Math.random() < 0.5) effects.dust(v.x - Math.cos(v.angle) * 24, v.y - Math.sin(v.angle) * 24, '#e8d4a8');
    // Pedestrians in the road: knocked down, never hurt worse than that.
    if (Math.abs(v.speed) > 70) {
      for (const ped of world.peds) {
        if (ped.down > 0) continue;
        if (Math.hypot(ped.x - v.x, ped.y - v.y) < 30) {
          ped.down = 3;
          wantedAdd(WANTED_GAIN.hitPed, 'You knocked a pedestrian down. Slow down!');
          effects.puff(ped.x, ped.y, '#f4e8d8', 6, 60);
          v.speed *= 0.85;
          break;
        }
      }
      // Nearby pedestrians scatter.
      for (const ped of world.peds) {
        if (ped.down === 0 && Math.hypot(ped.x - v.x, ped.y - v.y) < 150) {
          ped.fleeing = true;
          ped.fleeTime = 3;
          ped.dir = Math.atan2(ped.y - v.y, ped.x - v.x);
        }
      }
    }
    if (actions & ACTION_ENTER_EXIT) {
      if (Math.abs(v.speed) <= 60) exitVehicle(false);
    }
    if (actions & ACTION_HORN) SFX.horn();
  }

  function updateMissions() {
    const events = evaluateMissions(world.missions, world);
    for (const event of events) {
      if (event.type === 'wanted') {
        world.wanted = Math.max(world.wanted, event.value);
        SFX.wanted();
        notify('The police are on you. Shake them off.', '#ff8d7a');
      } else if (event.type === 'spawnTagged') {
        const type = event.tag === 'courier' ? 'van' : 'sports';
        const colour = event.tag === 'courier' ? '#f2c53d' : '#4fb8a8';
        world.vehicles.push(makeVehicle(type, colour, event.at.x, event.at.y, -Math.PI / 2, { parked: true, tag: event.tag }));
        notify(event.tag === 'courier' ? 'The courier van is waiting outside.' : 'The convertible is parked where Mateo said.', '#ffd166');
      } else if (event.type === 'advance') {
        effects.banner('OBJECTIVE', event.text, '#ffd166', 2.4);
        SFX.pickup();
      } else if (event.type === 'collected') {
        SFX.pickup();
        effects.popup(player.x, player.y - 30, 'Cache secured', '#ffd166');
      } else if (event.type === 'complete') {
        world.cash += event.reward;
        world.missions.index += 1;
        world.missions.active = null;
        SFX.missionDone();
        effects.banner('MISSION COMPLETE', `${event.title} — earned $${event.reward}`, '#9fd8a8', 3.4);
        notify(`+$${event.reward}`, '#9fd8a8');
        if (world.missions.index >= 6 && !world.storyDone) {
          world.storyDone = true;
          effects.banner('THE CITY IS YOURS', 'Story complete. Courier gigs pay across Marisol Bay.', '#ffd166', 4.5);
        }
      } else if (event.type === 'fail') {
        failMission(world.missions);
        SFX.fail();
        effects.banner('JOB FAILED', 'The clock ran out. Find the marker to try again.', '#ff8d7a', 3);
      }
    }
    world.marker = currentMarker(world.missions, city);
    world.objective = objectiveLine(world.missions, world);
    // Reaching the offer marker starts the mission (on foot or driving through it).
    if (!world.missions.active && world.marker && world.marker.kind === 'offer') {
      const focus = player.inVehicle ? player.vehicle : player;
      if (Math.hypot(focus.x - world.marker.x, focus.y - world.marker.y) < 40) {
        const def = startMission(world.missions, world);
        SFX.missionStart();
        effects.banner(def.def.title, `${def.def.from}: ${def.def.brief}`, '#ffd166', 4.2);
        for (const effect of def.effects) {
          if (effect.type === 'wanted') world.wanted = Math.max(world.wanted, effect.value);
          if (effect.type === 'spawnTagged') {
            const type = effect.tag === 'courier' ? 'van' : 'sports';
            const colour = effect.tag === 'courier' ? '#f2c53d' : '#4fb8a8';
            world.vehicles.push(makeVehicle(type, colour, effect.at.x, effect.at.y, -Math.PI / 2, { parked: true, tag: effect.tag }));
            notify('The van is waiting outside.', '#ffd166');
          }
        }
      }
    }
  }

  function updateDistrict() {
    const index = city.districtIndexAt(player.x, player.y);
    const name = DISTRICT_NAMES[index] ?? '';
    if (name && name !== world.districtSeen) {
      world.districtSeen = name;
      effects.banner(name, '', '#f5e9c8', 2);
    }
  }

  world.step = function step(dt, axis, actions) {
    world.time += dt;
    if (player.inVehicle) updatePlayerDriving(dt, axis, actions);
    else updatePlayerOnFoot(dt, axis, actions);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateWanted(dt);
    updateMissions();
    updateDistrict();
    effects.step();
    for (let i = world.notes.length - 1; i >= 0; i--) {
      world.notes[i].life -= dt;
      if (world.notes[i].life <= 0) world.notes.splice(i, 1);
    }
    const trafficCount = world.vehicles.filter((v) => v.npc && !v.parked).length;
    if (trafficCount < TRAFFIC.count && random() < 0.4) spawnTraffic();
  };

  world.notify = notify;
  world.wantedAdd = wantedAdd;
  world.exitVehicle = exitVehicle;
  world.hint = function hint() {
    if (player.inVehicle) return 'F — get out    SPACE — handbrake    H — horn';
    let near = null;
    let nearD = PLAYER.enterRange;
    for (const v of world.vehicles) {
      if (v.kind === 'police') continue;
      const d = Math.hypot(v.x - player.x, v.y - player.y);
      if (d < nearD) {
        nearD = d;
        near = v;
      }
    }
    if (near) return near.npc ? 'F — steal this car' : 'F — get in';
    return 'SPACE — shove';
  };

  return world;
}

const DISTRICT_NAMES = ['PALM SHORES', 'GLASSPOINT', 'LAVANDA HEIGHTS', 'OLD MARISOL', 'DOCKSIDE'];



function turnToward(angle, want, maxStep) {
  const diff = angleDiff(angle, want);
  return angle + clamp(diff, -maxStep, maxStep);
}

function angleDiff(from, to) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
