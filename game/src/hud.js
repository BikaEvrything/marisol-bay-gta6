// The HUD and every menu, drawn on the canvas above the world: cash and stars, the objective
// panel, the minimap with its icons, contextual hints, notifications, banners, the busted meter,
// and the title and pause menus (both keyboard- and mouse-driven). Nothing here simulates.

import { PALETTE, VIEW } from './config.js';

const MINIMAP_SIZE = 190;
const MINIMAP_SCALE = 3; // px of minimap base per world tile, matching buildMinimap

export function createHud(canvas, minimapBase) {
  const context = canvas.getContext('2d');
  const menu = { items: [], hover: -1 };

  function text(value, x, y, size, colour, align = 'left', weight = 'bold', font = '"Segoe UI", system-ui, sans-serif') {
    context.font = `${weight} ${size}px ${font}`;
    context.textAlign = align;
    context.fillStyle = colour;
    context.fillText(value, x, y);
  }

  function panel(x, y, w, h, colour = 'rgba(16, 24, 36, 0.72)') {
    context.fillStyle = colour;
    roundRect(context, x, y, w, h, 10);
    context.fill();
    context.strokeStyle = 'rgba(255, 240, 210, 0.18)';
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawWorldHud(world, time) {
    // Cash and wanted stars.
    panel(16, 14, 168, 40);
    text(`$${world.cash.toLocaleString('en-US')}`, 30, 42, 24, '#ffd166');
    const stars = '★'.repeat(world.wanted) + '☆'.repeat(5 - world.wanted);
    text(stars, 178, 41, 20, world.wanted > 0 ? '#ff8d7a' : '#7d8aa0', 'right');

    // Objective panel, top right.
    const objective = world.objective;
    context.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    const titleWidth = context.measureText(objective.title).width;
    const bodyWidth = context.measureText(objective.text).width;
    const panelWidth = Math.max(200, Math.min(430, Math.max(titleWidth, bodyWidth) + 34));
    panel(VIEW.width - panelWidth - 16, 14, panelWidth, 58);
    text(objective.title, VIEW.width - panelWidth - 30, 37, 14, '#ffd166');
    text(objective.text, VIEW.width - panelWidth - 30, 58, 13, '#e8e2d4', 'left', '600');

    // Busted meter, a closing ring when the police have you cornered.
    if (world.bustTimer > 0.2) {
      const p = Math.min(1, world.bustTimer / 2.4);
      text('BUSTED IN...', VIEW.width / 2, 90, 18, '#ff8d7a', 'center');
      context.strokeStyle = '#ff8d7a';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(VIEW.width / 2, 130, 22, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      context.stroke();
    }

    // Minimap, bottom right: a zoomed window of the pre-rendered city plus icons.
    const mx = VIEW.width - MINIMAP_SIZE - 18;
    const my = VIEW.height - MINIMAP_SIZE - 18;
    panel(mx - 4, my - 4, MINIMAP_SIZE + 8, MINIMAP_SIZE + 8, 'rgba(16, 24, 36, 0.8)');
    context.save();
    context.beginPath();
    context.rect(mx, my, MINIMAP_SIZE, MINIMAP_SIZE);
    context.clip();
    // The base map covers the whole city at MINIMAP_SCALE per tile; show a true magnified
    // window around the player (the source window shrinks as the zoom grows), clamped to the
    // base map's bounds so the world's edge reads as dark ground instead of a smear.
    const zoom = 2;
    const baseScale = MINIMAP_SCALE / 96; // base-map px per world px
    const cx = world.player.x * baseScale;
    const cy = world.player.y * baseScale;
    const halfSrc = MINIMAP_SIZE / zoom / 2;
    const sx = cx - halfSrc;
    const sy = cy - halfSrc;
    const ix0 = Math.max(0, sx);
    const iy0 = Math.max(0, sy);
    const ix1 = Math.min(minimapBase.width, sx + halfSrc * 2);
    const iy1 = Math.min(minimapBase.height, sy + halfSrc * 2);
    if (ix1 > ix0 && iy1 > iy0) {
      context.drawImage(
        minimapBase,
        ix0, iy0, ix1 - ix0, iy1 - iy0,
        mx + (ix0 - sx) * zoom, my + (iy0 - sy) * zoom, (ix1 - ix0) * zoom, (iy1 - iy0) * zoom,
      );
    }
    const half = MINIMAP_SIZE / 2;
    const toMinimap = (x, y) => ({ x: mx + half + (x * baseScale - cx) * zoom, y: my + half + (y * baseScale - cy) * zoom });
    for (const cop of world.police) {
      if (!cop.active) continue;
      const at = toMinimap(cop.x, cop.y);
      context.fillStyle = '#5a8dff';
      context.fillRect(at.x - 2, at.y - 2, 5, 5);
    }
    for (const v of world.vehicles) {
      if (v.parked || !v.npc) continue;
      const at = toMinimap(v.x, v.y);
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(at.x - 1, at.y - 1, 2, 2);
    }
    if (world.marker) {
      const at = toMinimap(world.marker.x, world.marker.y);
      context.fillStyle = world.marker.kind === 'offer' ? '#ffd166' : '#7dd6a8';
      context.beginPath();
      context.arc(at.x, at.y, 4.5, 0, Math.PI * 2);
      context.fill();
    }
    // The player: a little triangle pointing where they face.
    const focus = world.player.inVehicle ? world.player.vehicle : world.player;
    const angle = world.player.inVehicle ? focus.angle : world.player.facing;
    const at = toMinimap(focus.x, focus.y);
    context.save();
    context.translate(at.x, at.y);
    context.rotate(angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    panel(mx - 4, my - 4, MINIMAP_SIZE + 8, MINIMAP_SIZE + 8, 'rgba(0,0,0,0)');
    text('MARISOL BAY', mx + 8, my + MINIMAP_SIZE - 8, 11, 'rgba(255,255,255,0.55)', 'left', '600');

    // Off-screen marker arrow along the minimap rim.
    if (world.marker) {
      const at = toMinimap(world.marker.x, world.marker.y);
      const dx = at.x - (mx + half);
      const dy = at.y - (my + half);
      const distance = Math.hypot(dx, dy);
      if (distance > half - 14) {
        const ux = dx / distance;
        const uy = dy / distance;
        const ax = mx + half + ux * (half - 10);
        const ay = my + half + uy * (half - 10);
        context.save();
        context.translate(ax, ay);
        context.rotate(Math.atan2(uy, ux));
        context.fillStyle = '#ffd166';
        context.beginPath();
        context.moveTo(7, 0);
        context.lineTo(-4, -5);
        context.lineTo(-4, 5);
        context.closePath();
        context.fill();
        context.restore();
      }
    }

    // Contextual hint, bottom left.
    const hint = world.hint();
    context.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    const hintWidth = context.measureText(hint).width;
    panel(16, VIEW.height - 52, hintWidth + 28, 34);
    text(hint, 30, VIEW.height - 30, 14, '#e8e2d4');

    // Notifications stack above the hint.
    let ny = VIEW.height - 66;
    for (let i = world.notes.length - 1; i >= 0; i--) {
      const note = world.notes[i];
      context.globalAlpha = Math.min(1, note.life);
      context.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
      const w = context.measureText(note.text).width;
      panel(16, ny - 24, w + 28, 30, 'rgba(16, 24, 36, 0.62)');
      text(note.text, 30, ny - 4, 14, note.colour);
      ny -= 34;
    }
    context.globalAlpha = 1;

    // Banners: mission titles, BUSTED, district toasts.
    let by = 150;
    for (const banner of world.effects.banners) {
      const life = banner.time / banner.total;
      const slide = Math.min(1, (1 - life) * 6 + life * 3);
      context.globalAlpha = Math.min(1, life * 3);
      const titleWidth2 = 0;
      void titleWidth2;
      context.font = `bold ${banner.sub ? 30 : 44}px "Segoe UI", system-ui, sans-serif`;
      const w = context.measureText(banner.text).width;
      context.fillStyle = 'rgba(16, 24, 36, 0.66)';
      roundRect(context, VIEW.width / 2 - w / 2 - 24, by - 12, w + 48, banner.sub ? 76 : 56, 12);
      context.fill();
      context.strokeStyle = banner.colour;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = banner.colour;
      context.textAlign = 'center';
      if (banner.sub) {
        context.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
        context.fillText(banner.text, VIEW.width / 2, by + 22);
        context.font = '600 14px "Segoe UI", system-ui, sans-serif';
        context.fillStyle = '#e8e2d4';
        wrapText(context, banner.sub, VIEW.width / 2, by + 48, 420, 17);
      } else {
        context.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
        context.fillText(banner.text, VIEW.width / 2, by + 30);
      }
      by += banner.sub ? 96 : 70;
      context.textAlign = 'left';
      void slide;
    }
    context.globalAlpha = 1;
    void time;
  }

  /** Menu items register their boxes so the pointer can hover and click them. */
  function item(x, y, w, h, label, selected, active) {
    const hovered = menu.hover >= 0 && menu.items.length > menu.hover && menu.items[menu.hover].label === label;
    context.fillStyle = hovered ? 'rgba(255, 209, 102, 0.2)' : 'rgba(255, 255, 255, 0.06)';
    roundRect(context, x, y, w, h, 9);
    context.fill();
    context.strokeStyle = selected ? '#ffd166' : hovered ? 'rgba(255, 209, 102, 0.6)' : 'rgba(255, 240, 210, 0.2)';
    context.lineWidth = selected ? 2.5 : 1.5;
    context.stroke();
    text(label, x + w / 2, y + h / 2 + 7, 20, active ? '#ffd166' : hovered ? '#fff4d8' : '#cfd6de', 'center');
    menu.items.push({ x, y, w, h, label });
  }

  function beginMenu() {
    menu.items = [];
    menu.hover = -1;
  }

  function pointIn(x, y, itemBox) {
    return x >= itemBox.x && x <= itemBox.x + itemBox.w && y >= itemBox.y && y <= itemBox.y + itemBox.h;
  }

  /** Returns the clicked item's label, or null. Called after the menu is drawn. */
  function takeMenuClick(px, py) {
    for (const itemBox of menu.items) {
      if (pointIn(px, py, itemBox)) return itemBox.label;
    }
    return null;
  }

  function hoverAt(px, py) {
    menu.hover = -1;
    menu.items.forEach((itemBox, index) => {
      if (pointIn(px, py, itemBox)) menu.hover = index;
    });
    return menu.hover;
  }

  function drawTitle(selectedIndex, hasSave) {
    panel(VIEW.width / 2 - 290, 110, 580, 380, 'rgba(16, 24, 36, 0.55)');
    text('MARISOL BAY', VIEW.width / 2, 190, 58, '#ffd166', 'center');
    text('Sun, cash and getaways on an open coast', VIEW.width / 2, 226, 17, '#e8e2d4', 'center', '600');
    const items = hasSave ? ['Continue', 'New Game', 'Controls', 'Mute'] : ['New Game', 'Controls', 'Mute'];
    const labels = items;
    let y = 268;
    for (let i = 0; i < labels.length; i++) {
      item(VIEW.width / 2 - 150, y, 300, 44, labels[i], i === selectedIndex, i === selectedIndex);
      y += 54;
    }
    text('WASD — move and drive    F — enter or steal cars    SPACE — shove and handbrake', VIEW.width / 2, VIEW.height - 56, 14, 'rgba(232, 226, 212, 0.75)', 'center', '600');
    text('An original open-world caper. Everything here is local: no network, no assets, just code.', VIEW.width / 2, VIEW.height - 32, 12, 'rgba(232, 226, 212, 0.55)', 'center', '600');
    return labels;
  }

  function drawControls(selectedIndex) {
    panel(VIEW.width / 2 - 290, 110, 580, 380, 'rgba(16, 24, 36, 0.8)');
    text('HOW TO PLAY', VIEW.width / 2, 160, 30, '#ffd166', 'center');
    const lines = [
      ['WASD / arrows', 'walk, or steer when driving'],
      ['Shift', 'sprint on foot'],
      ['F or E', 'enter, steal or leave a vehicle'],
      ['Space', 'shove on foot · handbrake driving'],
      ['H', 'horn'],
      ['M', 'mute'],
      ['P or Esc', 'pause'],
      ['', ''],
      ['Reach the yellow marker to start a job.', ''],
      ['Stars fade when the police lose sight of you.', ''],
      ['A cruiser looming over a stopped car means BUSTED.', ''],
    ];
    let y = 208;
    for (const [key, meaning] of lines) {
      if (key) text(key, VIEW.width / 2 - 240, y, 15, '#ffd166');
      if (meaning) text(meaning, VIEW.width / 2 - 60, y, 15, '#e8e2d4');
      y += 24;
    }
    item(VIEW.width / 2 - 90, VIEW.height - 190, 180, 40, 'Back', selectedIndex === 0, selectedIndex === 0);
    return ['Back'];
  }

  function drawPause(selectedIndex, muted) {
    panel(VIEW.width / 2 - 250, 150, 500, 330, 'rgba(16, 24, 36, 0.8)');
    text('PAUSED', VIEW.width / 2, 212, 34, '#ffd166', 'center');
    const labels = ['Resume', 'Save game', 'Controls', muted ? 'Sound: off' : 'Sound: on', 'Quit to title'];
    let y = 246;
    for (let i = 0; i < labels.length; i++) {
      item(VIEW.width / 2 - 140, y, 280, 40, labels[i], i === selectedIndex, i === selectedIndex);
      y += 48;
    }
    return labels;
  }

  function drawWorldPaused(world) {
    // Dim the frozen world behind the pause panel.
    context.fillStyle = 'rgba(10, 16, 26, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    void world;
  }

  return { drawWorldHud, drawTitle, drawControls, drawPause, drawWorldPaused, beginMenu, takeMenuClick, hoverAt, text, panel };
}

function wrapText(ctx, value, x, y, maxWidth, lineHeight) {
  const words = value.split(' ');
  let line = '';
  let at = y;
  for (const word of words) {
    const test = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      ctx.fillText(line, x, at);
      line = word;
      at += lineHeight;
    } else line = test;
  }
  if (line !== '') ctx.fillText(line, x, at);
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

export { PALETTE, VIEW };
