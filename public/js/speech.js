// Thin wrappers over the Web Speech API (speech-to-text + text-to-speech).
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = !!SR;

export function createListener({ lang = 'en-IN', onInterim, onFinal, onState }) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let active = false;
  rec.onstart = () => {
    active = true;
    onState?.(true);
  };
  rec.onend = () => {
    active = false;
    onState?.(false);
  };
  rec.onerror = (e) => onState?.(false, e.error);
  rec.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    if (interim) onInterim?.(interim);
    if (final) onFinal?.(final.trim());
  };
  return {
    start(l) {
      if (l) rec.lang = l;
      if (!active) rec.start();
    },
    stop() {
      rec.stop();
    },
    get active() {
      return active;
    },
  };
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice =
    vs.find((v) => /en-IN/i.test(v.lang) && /female|heera|neerja|veena/i.test(v.name)) ||
    vs.find((v) => /en-IN/i.test(v.lang)) ||
    vs.find((v) => /en/i.test(v.lang) && /female|samantha|zira|aria|jenny|google uk english female/i.test(v.name)) ||
    vs.find((v) => /^en/i.test(v.lang)) ||
    null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

// onProgress(0..1): how far through the text the voice is, so the captions can keep up with it. It
// comes from the voice's word boundaries; voices that send none (Chrome's online Google voices) are
// estimated from the time spoken (~14 characters a second at rate 1).
let progressTimer;
export function speak(text, { onStart, onEnd, onProgress, rate = 1 } = {}) {
  if (!('speechSynthesis' in window)) return onEnd?.();
  speechSynthesis.cancel();
  clearInterval(progressTimer);
  const u = new SpeechSynthesisUtterance(text.replace(/₹\s?(\d+(?:,\d+)*)/g, '$1 rupees'));
  if (voice) u.voice = voice;
  u.rate = rate;
  u.pitch = 1.05;
  const len = u.text.length || 1;
  let boundaries = false, t0 = 0;
  const stop = () => clearInterval(progressTimer);
  u.onstart = () => {
    onStart?.();
    t0 = performance.now();
    if (onProgress) progressTimer = setInterval(() => !boundaries && onProgress(Math.min(1, ((performance.now() - t0) / 1000) * 14 * rate / len)), 250);
  };
  u.onboundary = (e) => {
    if (!onProgress || e.charIndex == null) return;
    boundaries = true;
    onProgress(Math.min(1, e.charIndex / len));
  };
  u.onend = () => (stop(), onProgress?.(1), onEnd?.());
  u.onerror = () => (stop(), onEnd?.());
  speechSynthesis.speak(u);
}
export const stopSpeaking = () => (clearInterval(progressTimer), 'speechSynthesis' in window && speechSynthesis.cancel());
