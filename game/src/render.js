// Drawing only: the world's state in, pixels out. The 1280x720 logical view is scaled to fit the
// window and centred. Everything is original vector work: flat sun-washed colours, a pseudo-3D
// building pass, animated water, and a pre-rendered minimap of the whole city.

import { CITY_COL, DISTRICTS, PALETTE, TILE, VIEW, WATER_COLS, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const ZOOM_DRIVE = 0.86;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  titleContext = context;
  const view = { scale: 1, x: 0, y: 0 };
  const cam = { x: 0, y: 0, zoom: 1, ready: false };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  function beginFrame() {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.scale, view.scale);
    context.beginPath();
    context.rect(0, 0, VIEW.width, VIEW.height);
    context.clip();
  }

  function endFrame() {
    context.restore();
  }

  /** The camera tracks the player (or their car) with a little look-ahead, and widens at speed. */
  function updateCamera(world, dt) {
    const focus = world.player.inVehicle ? world.player.vehicle : world.player;
    const speedX = world.player.inVehicle ? Math.cos(focus.angle) * focus.speed : 0;
    const speedY = world.player.inVehicle ? Math.sin(focus.angle) * focus.speed : 0;
    const targetX = focus.x + speedX * 0.42;
    const targetY = focus.y + speedY * 0.42;
    if (!cam.ready) {
      cam.x = targetX;
      cam.y = targetY;
      cam.ready = true;
    } else {
      const ease = Math.min(1, dt * 5);
      cam.x += (targetX - cam.x) * ease;
      cam.y += (targetY - cam.y) * ease;
    }
    const wantedZoom = world.player.inVehicle && Math.abs(focus.speed) > 200 ? ZOOM_DRIVE : 1;
    cam.zoom += (wantedZoom - cam.zoom) * Math.min(1, dt * 2);
    cam.halfW = VIEW.width / 2 / cam.zoom;
    cam.halfH = VIEW.height / 2 / cam.zoom;
  }

  function worldToScreen(x, y) {
    return {
      x: (x - cam.x) * cam.zoom + VIEW.width / 2,
      y: (y - cam.y) * cam.zoom + VIEW.height / 2,
    };
  }

  function drawWorld(world, time) {
    const { city, effects } = world;
    const shakeX = effects.shake > 0 ? (Math.random() - 0.5) * effects.shake : 0;
    const shakeY = effects.shake > 0 ? (Math.random() - 0.5) * effects.shake : 0;
    context.save();
    context.translate(VIEW.width / 2 + shakeX, VIEW.height / 2 + shakeY);
    context.scale(cam.zoom, cam.zoom);
    context.translate(-cam.x, -cam.y);

    const left = cam.x - cam.halfW - TILE;
    const right = cam.x + cam.halfW + TILE;
    const top = cam.y - cam.halfH - TILE;
    const bottom = cam.y + cam.halfH + TILE;
    const c0 = Math.max(0, Math.floor(left / TILE));
    const c1 = Math.min(WORLD.width / TILE - 1, Math.ceil(right / TILE));
    const r0 = Math.max(0, Math.floor(top / TILE));
    const r1 = Math.min(WORLD.height / TILE - 1, Math.ceil(bottom / TILE));

    // --- ground tiles
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const x = col * TILE;
        const y = row * TILE;
        const kind = city.types[row * (WORLD.width / TILE) + col];
        if (kind === 2) {
          context.fillStyle = PALETTE.water;
          context.fillRect(x, y, TILE, TILE);
        } else if (kind === 3) {
          context.fillStyle = PALETTE.sand;
          context.fillRect(x, y, TILE, TILE);
          if ((col + row) % 2 === 0) {
            context.fillStyle = 'rgba(255,255,255,0.05)';
            context.fillRect(x, y, TILE, TILE);
          }
        } else if (kind === 1) {
          context.fillStyle = PALETTE.asphalt;
          context.fillRect(x, y, TILE, TILE);
        } else {
          // Block tile: grass for parks, sidewalk next to a road or beach, lot concrete otherwise.
          const nearKerb =
            city.isRoadTile(col - 1, row) || city.isRoadTile(col + 1, row) || city.isRoadTile(col, row - 1) || city.isRoadTile(col, row + 1) ||
            city.isSandTile(col - 1, row) || city.isSandTile(col + 1, row) || city.isSandTile(col, row - 1) || city.isSandTile(col, row + 1);
          const park = blockIsPark(city, col, row);
          if (park) {
            context.fillStyle = (col + row) % 2 === 0 ? PALETTE.grass : PALETTE.grassDark;
            context.fillRect(x, y, TILE, TILE);
          } else if (nearKerb) {
            context.fillStyle = ((col % 2 === 0) === (row % 2 === 0)) ? PALETTE.sidewalk : PALETTE.sidewalkDark;
            context.fillRect(x, y, TILE, TILE);
          } else {
            context.fillStyle = '#b3a88f';
            context.fillRect(x, y, TILE, TILE);
          }
        }
      }
    }

    // Lane markings down the middle of every road pair in view.
    context.strokeStyle = 'rgba(245, 233, 200, 0.5)';
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    context.beginPath();
    for (const col of city.vx) {
      const x = (col + 1) * TILE;
      if (x < left || x > right) continue;
      context.moveTo(x, Math.max(0, top));
      context.lineTo(x, Math.min(WORLD.height, bottom));
    }
    for (const row of city.hy) {
      const y = (row + 1) * TILE;
      if (y < top || y > bottom) continue;
      context.moveTo(Math.max(0, left), y);
      context.lineTo(Math.min(WORLD.width, right), y);
    }
    context.stroke();
    context.setLineDash([]);

    // Water animation: light waves near the shore.
    context.strokeStyle = 'rgba(255,255,255,0.18)';
    context.lineWidth = 2;
    context.beginPath();
    const shoreX = WATER_COLS * TILE;
    for (let y = Math.floor(Math.max(0, top) / 40) * 40; y < Math.min(WORLD.height, bottom); y += 40) {
      const sway = Math.sin(time * 1.4 + y * 0.05) * 8;
      context.moveTo(shoreX - 26 + sway, y);
      context.quadraticCurveTo(shoreX - 40 + sway, y + 10, shoreX - 26 + sway, y + 20);
    }
    context.stroke();

    // The pier: wooden planks reaching into the sea.
    const pier = city.pier;
    if (pier.x1 > left && pier.y1 > top) {
      context.fillStyle = '#a3814f';
      context.fillRect(pier.x0, pier.y0, pier.x1 - pier.x0, pier.y1 - pier.y0);
      context.strokeStyle = '#8a6a3e';
      context.lineWidth = 2;
      for (let x = pier.x0; x < pier.x1; x += 22) {
        context.beginPath();
        context.moveTo(x, pier.y0);
        context.lineTo(x, pier.y1);
        context.stroke();
      }
    }

    // --- the mission marker, pulsing on the ground under everything else
    if (world.marker) {
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      const colour = world.marker.kind === 'offer' ? '#ffd166' : '#7dd6a8';
      context.save();
      context.translate(world.marker.x, world.marker.y);
      context.globalAlpha = 0.35;
      context.fillStyle = colour;
      context.beginPath();
      context.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = colour;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
      context.stroke();
      // A floating pin so the marker reads from across the street.
      const bob = Math.sin(time * 3) * 4;
      context.fillStyle = colour;
      context.beginPath();
      context.moveTo(0, -46 + bob);
      context.lineTo(10, -28 + bob);
      context.lineTo(0, -14 + bob);
      context.lineTo(-10, -28 + bob);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(16, 24, 36, 0.85)';
      context.beginPath();
      context.arc(0, -29 + bob, 4, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // Soft shadows under everything that moves.
    context.fillStyle = PALETTE.shadow;
    for (const v of world.vehicles) {
      if (!inView(v.x, v.y, cam)) continue;
      context.save();
      context.translate(v.x + 6, v.y + 8);
      context.rotate(v.angle);
      context.fillRect(-VEH_LEN / 2, -VEH_WID / 2, VEH_LEN, VEH_WID);
      context.restore();
    }

    // Parked-and-driven cars, traffic, taxis.
    for (const v of world.vehicles) {
      if (!inView(v.x, v.y, cam)) continue;
      drawCar(context, v, time);
    }
    for (const cop of world.police) {
      if (!cop.active || !inView(cop.x, cop.y, cam)) continue;
      drawCop(context, cop, time);
    }

    // Pedestrians.
    for (const ped of world.peds) {
      if (!inView(ped.x, ped.y, cam)) continue;
      if (ped.down > 0) {
        context.save();
        context.translate(ped.x, ped.y);
        context.rotate(ped.dir);
        context.fillStyle = PALETTE.ped[ped.colour];
        context.fillRect(-10, -4, 20, 8);
        context.restore();
      } else {
        context.fillStyle = PALETTE.ped[ped.colour];
        context.beginPath();
        context.arc(ped.x, ped.y, 7, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.5)';
        context.beginPath();
        context.arc(ped.x + Math.cos(ped.dir) * 3, ped.y + Math.sin(ped.dir) * 3, 2.4, 0, Math.PI * 2);
        context.fill();
      }
    }

    // The player: hidden while driving, walking otherwise.
    if (!world.player.inVehicle) {
      const p = world.player;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.facing + Math.PI / 2);
      // A walking body: shirt, head, and a white cap pointing where they face.
      context.fillStyle = PALETTE.playerShirt;
      roundRect(context, -8, -10, 16, 20, 6);
      context.fill();
      context.fillStyle = 'rgba(20, 30, 45, 0.35)';
      context.fillRect(-8, 2, 16, 8);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(0, -4, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, -8, 3.2, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // Buildings above the street life: walls, roofs and window bands.
    for (const b of city.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, cam, Math.max(b.w, b.h))) continue;
      drawBuilding(context, b);
    }

    // Palms and park trees, canopies over everything.
    for (const tree of city.trees) {
      if (!inView(tree.x, tree.y, cam, 80)) continue;
      drawTree(context, tree);
    }

    // Particles and floating text.
    for (const p of effects.particles) {
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.total);
      context.globalAlpha = alpha;
      context.fillStyle = p.colour;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    context.textAlign = 'center';
    for (const t of effects.popups) {
      if (!t.active) continue;
      context.globalAlpha = Math.min(1, t.life * 2);
      context.fillStyle = 'rgba(20,30,45,0.55)';
      context.fillText(t.text, t.x + 1.5, t.y + 1.5);
      context.fillStyle = t.colour;
      context.fillText(t.text, t.x, t.y);
    }
    context.globalAlpha = 1;

    context.restore();

    // The sun-washed tint: a warm gradient over the whole view.
    const tint = context.createLinearGradient(0, 0, VIEW.width, VIEW.height);
    tint.addColorStop(0, 'rgba(255, 214, 140, 0.10)');
    tint.addColorStop(0.6, 'rgba(255, 240, 210, 0.04)');
    tint.addColorStop(1, 'rgba(80, 60, 120, 0.10)');
    context.fillStyle = tint;
    context.fillRect(0, 0, VIEW.width, VIEW.height);

    if (effects.flash > 0) {
      context.fillStyle = `rgba(255, 120, 100, ${effects.flash * 0.35})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  return {
    draw(world, screen, time, dt) {
      beginFrame();
      if (screen === SCREEN_TITLE) {
        drawTitleBackdrop(world, time);
      } else {
        updateCamera(world, dt);
        drawWorld(world, time);
      }
      endFrame();
    },
    view,
    cam,
    /** Screen position of a world point, for the HUD's off-screen marker arrow. */
    project(x, y) {
      return worldToScreen(x, y);
    },
    camera: cam,
  };
}

const VEH_LEN = 46;
const VEH_WID = 24;

function inView(x, y, cam, margin = 120) {
  return x > cam.x - cam.halfW - margin && x < cam.x + cam.halfW + margin && y > cam.y - cam.halfH - margin && y < cam.y + cam.halfH + margin;
}

function blockIsPark(city, col, row) {
  for (const block of city.blocks) {
    if (col >= block.c0 && col <= block.c1 && row >= block.r0 && row <= block.r1) return block.park;
  }
  return false;
}

function drawCar(context, v, time) {
  context.save();
  context.translate(v.x, v.y);
  context.rotate(v.angle);
  const body = v.colour;
  context.fillStyle = body;
  roundRect(context, -VEH_LEN / 2, -VEH_WID / 2, VEH_LEN, VEH_WID, 6);
  context.fill();
  // Cabin glass and a roof stripe by body type.
  context.fillStyle = 'rgba(30, 42, 58, 0.75)';
  roundRect(context, -4, -VEH_WID / 2 + 3.5, 14, VEH_WID - 7, 3);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(context, -VEH_LEN / 2 + 4, -VEH_WID / 2 + 2, 8, VEH_WID - 4, 2);
  context.fill();
  if (v.type === 'taxi') {
    context.fillStyle = '#222';
    context.fillRect(-6, -5, 12, 10);
    context.fillStyle = '#f2c53d';
    context.fillRect(-4, -3, 8, 6);
  }
  if (v.type === 'van') {
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(-VEH_LEN / 2 + 6, -VEH_WID / 2 + 6, VEH_LEN - 20, 3);
  }
  // Headlights glow at dusk-ish; tail lights when braking fast are skipped (no brake state here).
  context.fillStyle = `rgba(255, 244, 200, ${0.5 + Math.sin(time * 3 + v.id) * 0.1})`;
  context.fillRect(VEH_LEN / 2 - 3, -VEH_WID / 2 + 2, 3, 5);
  context.fillRect(VEH_LEN / 2 - 3, VEH_WID / 2 - 7, 3, 5);
  context.restore();
}

function drawCop(context, cop, time) {
  context.save();
  context.translate(cop.x, cop.y);
  context.rotate(cop.angle);
  context.fillStyle = PALETTE.police;
  roundRect(context, -VEH_LEN / 2, -VEH_WID / 2, VEH_LEN, VEH_WID, 6);
  context.fill();
  context.fillStyle = PALETTE.policeStripe;
  context.fillRect(-VEH_LEN / 2 + 10, -VEH_WID / 2 + 4, VEH_LEN - 20, 5);
  context.fillRect(-VEH_LEN / 2 + 10, VEH_WID / 2 - 9, VEH_LEN - 20, 5);
  context.fillStyle = 'rgba(30, 42, 58, 0.75)';
  roundRect(context, -4, -VEH_WID / 2 + 3.5, 14, VEH_WID - 7, 3);
  context.fill();
  // The light bar: red and blue alternating with the siren's rhythm.
  const flash = Math.sin(time * 14) > 0;
  context.fillStyle = flash ? '#ff5a5a' : '#5a8dff';
  context.fillRect(-6, -8, 8, 6);
  context.fillStyle = flash ? '#5a8dff' : '#ff5a5a';
  context.fillRect(-6, 2, 8, 6);
  context.restore();
  if (cop.chasing) {
    const pulse = 1 + Math.sin(time * 6) * 0.15;
    context.strokeStyle = 'rgba(255, 90, 90, 0.35)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cop.x, cop.y, 40 * pulse, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawBuilding(context, b) {
  const lift = Math.round(b.height * 9);
  // Ground shadow toward the sun (west), then the south and east walls, then the roof.
  context.fillStyle = 'rgba(20, 30, 45, 0.22)';
  context.fillRect(b.x - 8, b.y - lift + 8, b.w + 10, b.h + 8);
  // South wall.
  context.fillStyle = shade(b.wall, -14);
  context.fillRect(b.x, b.y + b.h - lift, b.w, lift);
  // East wall.
  context.fillStyle = shade(b.wall, -30);
  context.fillRect(b.x + b.w - Math.min(lift, 26), b.y - lift, Math.min(lift, 26), b.h);
  // Roof.
  context.fillStyle = b.roof;
  context.fillRect(b.x, b.y - lift, b.w, b.h);
  context.fillStyle = shade(b.roof, 16);
  context.fillRect(b.x + 5, b.y - lift + 5, b.w - 10, Math.min(18, b.h - 10));
  if (b.win) {
    context.fillStyle = 'rgba(255, 244, 214, 0.55)';
    const rows = Math.max(1, Math.floor((b.h - lift) / 26));
    for (let r = 0; r < rows; r++) {
      const wy = b.y + b.h - lift - (r + 1) * 20;
      for (let wx = b.x + 10; wx < b.x + b.w - 14; wx += 26) {
        context.fillRect(wx, wy, 12, 9);
      }
    }
  }
}

function drawTree(context, tree) {
  context.fillStyle = 'rgba(20, 30, 45, 0.22)';
  context.beginPath();
  context.ellipse(tree.x + 10, tree.y + 8, 16, 8, 0, 0, Math.PI * 2);
  context.fill();
  if (tree.palm) {
    context.strokeStyle = PALETTE.trunk;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(tree.x, tree.y + 6);
    context.quadraticCurveTo(tree.x + 4, tree.y - 6, tree.x + 2, tree.y - 16);
    context.stroke();
    for (let k = 0; k < 6; k++) {
      const angle = (k / 6) * Math.PI * 2;
      context.strokeStyle = k % 2 === 0 ? PALETTE.palm : PALETTE.palmDark;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(tree.x + 2, tree.y - 16);
      context.quadraticCurveTo(
        tree.x + 2 + Math.cos(angle) * 14,
        tree.y - 16 + Math.sin(angle) * 10 - 4,
        tree.x + 2 + Math.cos(angle) * 22,
        tree.y - 16 + Math.sin(angle) * 14 + 4,
      );
      context.stroke();
    }
  } else {
    context.fillStyle = PALETTE.trunk;
    context.fillRect(tree.x - 3, tree.y - 8, 6, 12);
    context.fillStyle = PALETTE.palm;
    context.beginPath();
    context.arc(tree.x, tree.y - 16, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.palmDark;
    context.beginPath();
    context.arc(tree.x - 6, tree.y - 12, 8, 0, Math.PI * 2);
    context.arc(tree.x + 7, tree.y - 20, 7, 0, Math.PI * 2);
    context.fill();
  }
}

/** The title screen backdrop: a slow pan over the sleeping city. */
function drawTitleBackdrop(world, time) {
  const cam = { halfW: VIEW.width / 2, halfH: VIEW.height / 2 };
  const t = time * 22;
  cam.x = WORLD.width * 0.35 + Math.sin(time * 0.1) * 300;
  cam.y = WORLD.height * 0.45 + Math.cos(time * 0.07) * 200;
  const context = getContext();
  void world;
  void t;
  context.fillStyle = PALETTE.backdrop;
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  // A stylised skyline: simple tower silhouettes over a sun gradient.
  const sky = context.createLinearGradient(0, 0, 0, VIEW.height);
  sky.addColorStop(0, '#ffca7a');
  sky.addColorStop(0.45, '#f59a86');
  sky.addColorStop(1, '#3a5b78');
  context.fillStyle = sky;
  context.fillRect(0, 0, VIEW.width, VIEW.height);
  context.fillStyle = 'rgba(255, 244, 210, 0.9)';
  context.beginPath();
  context.arc(VIEW.width * 0.72, VIEW.height * 0.42, 90, 0, Math.PI * 2);
  context.fill();
  const towers = [
    [0.06, 0.62, 0.09, 0.38],
    [0.18, 0.5, 0.07, 0.5],
    [0.28, 0.68, 0.1, 0.32],
    [0.41, 0.42, 0.08, 0.58],
    [0.52, 0.58, 0.11, 0.42],
    [0.66, 0.36, 0.07, 0.64],
    [0.76, 0.55, 0.09, 0.45],
    [0.88, 0.66, 0.1, 0.34],
  ];
  for (const [x, y, w, h] of towers) {
    context.fillStyle = 'rgba(24, 40, 60, 0.85)';
    context.fillRect(VIEW.width * x, VIEW.height * y, VIEW.width * w, VIEW.height * h);
    context.fillStyle = 'rgba(255, 214, 140, 0.25)';
    for (let wy = y + 0.04; wy < y + h - 0.05; wy += 0.07) {
      for (let wx = x + 0.015; wx < x + w - 0.02; wx += 0.03) {
        context.fillRect(VIEW.width * wx, VIEW.height * wy, 8, 10);
      }
    }
  }
  // Water strip with wave dashes at the bottom.
  context.fillStyle = '#2ea8b8';
  context.fillRect(0, VIEW.height * 0.86, VIEW.width, VIEW.height * 0.14);
  context.strokeStyle = 'rgba(255,255,255,0.25)';
  context.lineWidth = 2;
  for (let y = VIEW.height * 0.88; y < VIEW.height; y += 16) {
    context.beginPath();
    for (let x = 0; x < VIEW.width; x += 60) {
      context.moveTo(x + ((time * 40) % 60), y);
      context.lineTo(x + 26 + ((time * 40) % 60), y);
    }
    context.stroke();
  }
}

/** The title screen's backdrop shares the renderer's 2d context, set when the renderer is made. */
let titleContext = null;
function getContext() {
  return titleContext;
}

/**
 * A whole-city minimap, pre-rendered once: roads as light lines on dark blocks, water, sand and
 * district-tinted building blocks. The HUD blits a window of it and pins icons on top.
 */
export function buildMinimap(city) {
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.width / TILE * scale;
  canvas.height = WORLD.height / TILE * scale;
  const ctx = canvas.getContext('2d');
  const tilesW = WORLD.width / TILE;
  const tilesH = WORLD.height / TILE;
  for (let row = 0; row < tilesH; row++) {
    for (let col = 0; col < tilesW; col++) {
      const kind = city.types[row * tilesW + col];
      if (kind === 2) ctx.fillStyle = '#2ea8b8';
      else if (kind === 3) ctx.fillStyle = '#ecd39f';
      else if (kind === 1) ctx.fillStyle = '#5a6272';
      else {
        const district = districtOfTile(city, col, row);
        ctx.fillStyle = district ? DISTRICTS[district].roof[0] : '#8a8f9a';
      }
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  return canvas;
}

function districtOfTile(city, col, row) {
  for (const block of city.blocks) {
    if (col >= block.c0 && col <= block.c1 && row >= block.r0 && row <= block.r1) return block.district;
  }
  return null;
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

export { CITY_COL, DISTRICTS };
