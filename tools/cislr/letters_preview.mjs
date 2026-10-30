// Render Meera making each ISL alphabet letter (the first pose of each), for checking against the
// ISLAN photos. Needs the copy's app running (APP_URL, default http://localhost:5174/).
// Usage: node letters_preview.mjs   -> preview/letters/<L>.png ; then python letters_sheet.py
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'preview', 'letters');
mkdirSync(OUT, { recursive: true });
const PORT = 9335;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome-profile')}`,
  '--enable-unsafe-swiftshader', '--window-size=900,800', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Page.navigate', { url: process.env.APP_URL || 'http://localhost:5174/' });
await sleep(6000);
await ev(`(()=>{document.getElementById('welcome')?.remove();const a=aria.avatar;a.queue=[];a.frame=null;a.speed=0;return true})()`);
const rect = await ev(`(()=>{const r=document.querySelector('#avatar').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
// close-up of the hands in front of her chest
const clip = { x: rect.x + rect.w * 0.33, y: rect.y + rect.h * 0.4, width: rect.w * 0.34, height: rect.h * 0.34, scale: 1.4 };
for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  const ok = await ev(`(async()=>{const m=await import('/js/signs.js');const fr=m.fingerspellFrames('${L}',0);const f=fr[0];const a=aria.avatar;a.frame=null;a.queue=[];a.pressing=!!f.press;a.state=a._poseState(f);a._apply();return fr.length})()`);
  await sleep(150);
  const r = await send('Page.captureScreenshot', { format: 'png', clip });
  writeFileSync(join(OUT, `${L}.png`), Buffer.from(r.result.data, 'base64'));
  console.log(L, 'frames', ok);
}
ws.close();
chrome.kill();
process.exit(0);
