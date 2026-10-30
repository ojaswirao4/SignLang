// End-to-end camera test: Chrome plays a .y4m file (make_cam_video.py) as the webcam, the app's ISL
// camera recognises the signs, and this prints what landed in the sign buffer and the alternatives.
// Usage: node camera_test.mjs <video.y4m> [seconds]   (the copy's app must be running, APP_URL)
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const video = resolve(process.argv[2]);
const secs = +(process.argv[3] || 40);
const PORT = 9336;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, '.chrome-profile-cam')}`,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`,
  '--enable-unsafe-swiftshader', '--window-size=1280,900', '--no-first-run', 'about:blank',
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
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result;
  if (r?.exceptionDetails) console.log('page error:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r?.result?.value;
};

await send('Runtime.enable');
await send('Page.navigate', { url: process.env.APP_URL || 'http://localhost:5174/?start' });
// wait for the app to be ready (slow on a busy laptop, e.g. while the converter runs)
for (let i = 0; i < 180 && !(await ev(`document.readyState === 'complete' && !!document.querySelector('#signBtn')`)); i++) await sleep(1000);
await sleep(3000);
// collect every word the camera adds (with its alternatives), even after auto-send clears the buffer
await ev(`(()=>{window.__seen=[];window.__islTrace=[];const box=document.querySelector('#glossBuffer');new MutationObserver(()=>{const c=[...box.querySelectorAll('.bchip')].map(e=>e.textContent);if(c.length)window.__last=c;}).observe(box,{childList:true,subtree:true});
  const alts=document.querySelector('#recAlts');new MutationObserver(()=>{const w=window.__last||[];window.__seen.push({chips:w.join(' '),alts:[...alts.querySelectorAll('button')].map(b=>b.textContent).join(', ')});}).observe(alts,{childList:true,subtree:true});
  document.querySelector('#autoSend').checked=false;document.querySelector('#signBtn').click();return true})()`);
await sleep(secs * 1000);
const out = await ev(`JSON.stringify({seen:window.__seen,final:[...document.querySelectorAll('#glossBuffer .bchip')].map(e=>e.textContent),hud:document.querySelector('#handShape').textContent,cam:document.querySelector('#camLoading').hidden?'running':document.querySelector('#camLoading').textContent})`);
console.log(out);
// TRACE=file.json: also save what the recogniser received for each sign and its top matches
if (process.env.TRACE) writeFileSync(process.env.TRACE, await ev(`JSON.stringify(window.__islTrace || [])`));
if (logs.length) console.log('console errors:', logs.slice(0, 5));
ws.close();
chrome.kill();
process.exit(0);
