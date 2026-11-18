// Transient, purely decorative things: puff particles, skid dust, floating text popups, screen
// banners (mission titles, BUSTED, district toasts) and a mild camera shake. Nothing here affects
// the rules; the world only calls `spawn*` and the renderer reads the lists.

import { STEP } from './config.js';

const MAX_PARTICLES = 260;
const MAX_POPUPS = 24;

export function createEffects() {
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, total: 1, size: 3, colour: '#fff', kind: 0 });
  const popups = [];
  for (let i = 0; i < MAX_POPUPS; i++) popups.push({ active: false, x: 0, y: 0, life: 0, text: '', colour: '#fff' });
  const banners = [];
  let shake = 0;
  let flash = 0;

  function free(list) {
    for (const item of list) if (!item.active) return item;
    return null;
  }

  function puff(x, y, colour, count, speed) {
    for (let k = 0; k < count; k++) {
      const p = free(particles);
      if (!p) return;
      const angle = (k / count) * Math.PI * 2;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed * (0.4 + Math.random() * 0.8);
      p.vy = Math.sin(angle) * speed * (0.4 + Math.random() * 0.8);
      p.life = p.total = 0.5 + Math.random() * 0.4;
      p.size = 3 + Math.random() * 4;
      p.colour = colour;
      p.kind = 0;
    }
  }

  function dust(x, y, colour) {
    const p = free(particles);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 30;
    p.vy = (Math.random() - 0.5) * 30;
    p.life = p.total = 0.7 + Math.random() * 0.5;
    p.size = 4 + Math.random() * 5;
    p.colour = colour;
    p.kind = 1;
  }

  function popup(x, y, text, colour) {
    const t = free(popups);
    if (!t) return;
    t.active = true;
    t.x = x;
    t.y = y;
    t.life = 1.4;
    t.text = text;
    t.colour = colour;
  }

  function banner(text, sub, colour, time) {
    banners.push({ text, sub, colour, time, total: time });
    if (banners.length > 3) banners.shift();
  }

  function kick(amount) {
    shake = Math.min(10, shake + amount);
  }

  function punch() {
    flash = 0.5;
  }

  function step() {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= STEP;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * STEP;
      p.y += p.vy * STEP;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.kind === 1) p.size += 6 * STEP;
    }
    for (const t of popups) {
      if (!t.active) continue;
      t.life -= STEP;
      t.y -= 26 * STEP;
      if (t.life <= 0) t.active = false;
    }
    for (let i = banners.length - 1; i >= 0; i--) {
      banners[i].time -= STEP;
      if (banners[i].time <= 0) banners.splice(i, 1);
    }
    shake = Math.max(0, shake - 22 * STEP);
    flash = Math.max(0, flash - STEP);
  }

  function reset() {
    for (const p of particles) p.active = false;
    for (const t of popups) t.active = false;
    banners.length = 0;
    shake = 0;
    flash = 0;
  }

  return { particles, popups, banners, shake, flash, puff, dust, popup, banner, kick, punch, step, reset };
}
