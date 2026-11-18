// Captures the game's staged screenshot scenes with the installed desktop Chrome, headless.
// Node 22+ standard library only: it speaks Chrome DevTools Protocol over the built-in
// WebSocket, waits for the game's own window.__shotReady flag (a real render of a real scene,
// never a mockup), and saves JPEGs into screenshots/.
//
// Usage: node tools/capture.mjs [--out screenshots] [--seed N] [--check]
//   --check  loads the plain game (no ?shot) and reports console errors instead of shooting.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  if (at === -1) return fallback;
  const value = args[at + 1];
  args.splice(at, 2);
  return value ?? '';
};
const outDir = resolve(flag('--out', join(here, 'screenshots')));
const check = args.includes('--check');
const shotsFile = join(here, 'shots.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(here, 'game', pathname));
  if (!file.startsWith(join(here, 'game'))) {
    response.writeHead(403).end('forbidden');
    return;
  }
  try {
    const bytes = readFileSync(file);
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404).end('not found');
  }
});
server.listen(0, '127.0.0.1');
await new Promise((done) => server.on('listening', done));
const port = server.address().port;
console.log(`serving game/ on 127.0.0.1:${port}`);

// --- Chrome with a scratch profile and a debug port.
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--mute-audio',
  `--remote-debugging-port=0`,
  `--user-data-dir=/tmp/opencode/marisol-chrome-${Date.now()}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const wsUrl = await new Promise((done, fail) => {
  let buffer = '';
  const onData = (chunk) => {
    buffer += chunk.toString();
    const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) {
      chrome.stderr.off('data', onData);
      done(match[1]);
    }
  };
  chrome.stderr.on('data', onData);
  chrome.on('exit', () => fail(new Error(`chrome exited early: ${buffer}`)));
  setTimeout(() => fail(new Error(`chrome never printed a debug port: ${buffer}`)), 15000);
});
console.log('chrome devtools at', wsUrl);

const socket = new WebSocket(wsUrl);
await new Promise((done, fail) => {
  socket.onopen = done;
  socket.onerror = (event) => fail(new Error('websocket error'));
});

let nextId = 1;
const pending = new Map();
const events = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve: resolveCall, reject: rejectCall } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectCall(new Error(message.error.message ?? JSON.stringify(message.error)));
    else resolveCall(message.result);
    return;
  }
  if (message.method) events.push(message);
};

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  socket.send(JSON.stringify(payload));
  return new Promise((resolveCall, rejectCall) => {
    pending.set(id, { resolve: resolveCall, reject: rejectCall });
  });
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');
await call('Runtime.enable');
await call('Log.enable');
await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)}`);
  return result.result.value;
}

async function waitFor(expr, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await evaluate(expr);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`);
    await new Promise((done) => setTimeout(done, 120));
  }
}

async function load(url) {
  await call('Page.navigate', { url });
  // Page frames: wait for the document to be interactive enough to evaluate.
  await waitFor('document.readyState !== "uninitialized"', 10000, 'document ready');
}

const errors = [];
async function drainErrors(label) {
  const recent = events.splice(0).filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded');
  for (const event of recent) {
    if (event.method === 'Runtime.exceptionThrown') {
      const detail = event.params.exceptionDetails;
      errors.push(`${label}: ${detail.exception?.description ?? detail.text}`);
    } else if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
      errors.push(`${label}: ${event.params.entry.text}`);
    }
  }
}

if (check) {
  await load(`http://127.0.0.1:${port}/index.html`);
  await new Promise((done) => setTimeout(done, 3000));
  await drainErrors('game');
  const title = await evaluate('document.title');
  console.log('loaded:', title);
  // Drive the menu with real key events, then let the world run a moment.
  await call('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
  await new Promise((done) => setTimeout(done, 4000));
  await drainErrors('game-play');
  const status = await evaluate('document.getElementById("status")?.textContent ?? ""');
  console.log('status line:', status);
  const driving = await evaluate('(() => { const w = window.__world; return w ? `cash ${w.cash} wanted ${w.wanted}` : "no handle"; })()');
  console.log('world probe:', driving);
  if (errors.length === 0) console.log('NO BROWSER ERRORS');
  else {
    console.log('BROWSER ERRORS:');
    for (const error of errors) console.log(' -', error);
  }
  chrome.kill();
  server.close();
  process.exit(errors.length === 0 ? 0 : 1);
}

// --- screenshot scenes from shots.json
const shots = JSON.parse(readFileSync(shotsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

for (const spec of shots) {
  const url = `http://127.0.0.1:${port}/index.html${spec.query}`;
  console.log('capturing', spec.name, url);
  await load(url);
  await drainErrors(spec.name);
  await waitFor('window.__shotReady === true', 30000, `__shotReady for ${spec.name}`);
  await drainErrors(spec.name);
  const problem = await evaluate('window.__shotError ?? null');
  if (problem) {
    console.error(`scene ${spec.name} reported an error:\n${problem}`);
    chrome.kill();
    server.close();
    process.exit(1);
  }
  const summary = await evaluate(
    `JSON.stringify({
      player: window.__world.player.inVehicle ? [Math.round(window.__world.player.vehicle.x), Math.round(window.__world.player.vehicle.y)] : [Math.round(window.__world.player.x), Math.round(window.__world.player.y)],
      police: window.__world.police.filter((c) => c.active).map((c) => [Math.round(c.x), Math.round(c.y)]),
      traffic: window.__world.vehicles.filter((v) => v.npc && !v.parked).length,
      wanted: window.__world.wanted,
    })`,
  );
  console.log('  scene state:', summary);
  const shot = await call('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  const bytes = Buffer.from(shot.data, 'base64');
  writeFileSync(join(outDir, spec.name), bytes);
  console.log(`  saved ${spec.name} (${Math.round(bytes.length / 1024)} KiB)`);
}

// The plain game's title screen as an error check for every scene's sibling state.
await load(`http://127.0.0.1:${port}/index.html`);
await new Promise((done) => setTimeout(done, 2500));
await drainErrors('title');
if (errors.length === 0) console.log('NO BROWSER ERRORS');
else {
  console.log('BROWSER ERRORS:');
  for (const error of errors) console.log(' -', error);
}

chrome.kill();
server.close();
process.exit(errors.length === 0 ? 0 : 1);
