// ── GEASS SYMBOL: load & remove black background ──────────────
const GEASS_IMG_RAW = new Image();
GEASS_IMG_RAW.crossOrigin = 'anonymous';
GEASS_IMG_RAW.src = 'geass.jpg';

let GEASS_CANVAS = null;

function processGeassImage(img) {
  const oc = document.createElement('canvas');
  oc.width  = img.naturalWidth  || img.width;
  oc.height = img.naturalHeight || img.height;
  const octx = oc.getContext('2d');
  octx.drawImage(img, 0, 0);
  const imageData = octx.getImageData(0, 0, oc.width, oc.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    if (brightness < 60) {
      data[i+3] = 0;
    } else {
      const alpha = Math.min(255, (brightness / 255) * 255);
      data[i]   = Math.min(255, r + 80);
      data[i+1] = Math.max(0,   g - 40);
      data[i+2] = Math.max(0,   b - 40);
      data[i+3] = alpha;
    }
  }
  octx.putImageData(imageData, 0, 0);
  GEASS_CANVAS = oc;
}

GEASS_IMG_RAW.onload = () => processGeassImage(GEASS_IMG_RAW);
if (GEASS_IMG_RAW.complete && GEASS_IMG_RAW.naturalWidth) processGeassImage(GEASS_IMG_RAW);

// ── DOM ───────────────────────────────────────────────────────
const video    = document.getElementById('video');
const canvas   = document.getElementById('canvas');
const ctx      = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const phaseEl  = document.getElementById('phase');
const glitchEl = document.getElementById('glitch');

// ── STATE MACHINE ─────────────────────────────────────────────
const S = { IDLE:0, COVERING:1, CHARGED:2, REVEAL:3 };
let state        = S.IDLE;
let coverFrames  = 0;
let activeFrames = 0;
let eyeAlpha     = 0;
let chargeAmt    = 0;
const CHARGE_FRAMES = 15;

let earHistory   = [];
let blinkArmed   = false;
let spaceRelease = false;
const EAR_BLINK_THRESH = 0.20;
const EAR_OPEN_THRESH  = 0.25;

let faceData = null;
let handData = null;

// ── AUDIO ─────────────────────────────────────────────────────
const _bgm = new Audio('backsound.mp3');
_bgm.loop   = true;
_bgm.volume = 0.35;
let _bgmEnabled = false;

// ── INTRO DIALOG LOGIC ────────────────────────────────────────
(function () {
  const dialog  = document.getElementById('intro-dialog');
  const loading = document.getElementById('loading');
  const btnOn   = document.getElementById('btn-music-on');
  const btnOff  = document.getElementById('btn-music-off');

  function startApp(withMusic) {
    _bgmEnabled = withMusic;
    dialog.style.transition = 'opacity 0.6s ease';
    dialog.style.opacity = '0';
    setTimeout(() => {
      dialog.style.display = 'none';
      loading.style.display = 'flex';
      if (withMusic) _bgm.play().catch(() => {});
      window._appReady = true;
      setTimeout(startCamera, 2600);
    }, 620);
  }

  function showMusicCtrl(enabled) {
    const ctrl = document.getElementById('music-ctrl');
    ctrl.classList.add('visible');
    if (enabled) ctrl.classList.add('music-on');
    const btn = document.getElementById('btn-toggle-music');
    btn.textContent = enabled ? '\u23F8' : '\u25B6';
    if (enabled) btn.classList.add('playing');
  }

  btnOn.addEventListener('click',  () => { startApp(true);  showMusicCtrl(true); });
  btnOff.addEventListener('click', () => { startApp(false); showMusicCtrl(false); });

  loading.style.display = 'none';
})();

// ── MUSIC CONTROL WIDGET ──────────────────────────────────────
(function () {
  const ctrl      = document.getElementById('music-ctrl');
  const btnToggle = document.getElementById('btn-toggle-music');
  const volSlider = document.getElementById('vol-slider');
  const volLabel  = document.getElementById('vol-label');

  btnToggle.addEventListener('click', () => {
    _bgmEnabled = !_bgmEnabled;
    if (_bgmEnabled) {
      _bgm.play().catch(() => {});
      btnToggle.textContent = '\u23F8';
      btnToggle.classList.add('playing');
      ctrl.classList.add('music-on');
    } else {
      _bgm.pause();
      btnToggle.textContent = '\u25B6';
      btnToggle.classList.remove('playing');
      ctrl.classList.remove('music-on');
    }
  });

  volSlider.addEventListener('input', () => {
    const val = parseInt(volSlider.value, 10);
    _bgm.volume = val / 100;
    volLabel.textContent = val;
    volSlider.style.setProperty('--vp', val + '%');
  });
})();

// ── SOUND EFFECTS ─────────────────────────────────────────────
const _sndCharge = new Audio('geass_charge.mp3');
function playCharge() { _sndCharge.currentTime = 0; _sndCharge.play().catch(() => {}); }

const _sndRelease = new Audio('geass_release.mp3');
function playReveal() { _sndRelease.currentTime = 0; _sndRelease.play().catch(() => {}); }

// ── CANVAS ────────────────────────────────────────────────────
function resizeCanvas() {
  if (video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
}

// ── FACE HELPERS ──────────────────────────────────────────────
const LEFT_EYE_IDX = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];

function getEyeCenter(lm) {
  const W = canvas.width, H = canvas.height;
  const pts = LEFT_EYE_IDX.map(i => ({ x: lm[i].x * W, y: lm[i].y * H }));
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length
  };
}

function getEyeRadius(lm) {
  const W = canvas.width, H = canvas.height;
  const x1 = lm[33].x * W,  y1 = lm[33].y * H;
  const x2 = lm[133].x * W, y2 = lm[133].y * H;
  return Math.max(8, Math.hypot(x2 - x1, y2 - y1) * 0.6);
}

// ── HAND HELPERS ──────────────────────────────────────────────
function isDiagonalPose() { return true; }

function fingersNearEye(hlm, eyePt) {
  const W = canvas.width, H = canvas.height;
  const fx = (hlm[8].x + hlm[12].x) / 2;
  const fy = (hlm[8].y + hlm[12].y) / 2;
  return Math.abs(fx - eyePt.x / W) < 0.18 && Math.abs(fy - eyePt.y / H) < 0.18;
}

// ── 2D FX SYSTEM ──────────────────────────────────────────────
const fxList = [];

class WhiteFlash {
  constructor() { this.alpha = 0.85; this.dead = false; }
  update() { this.alpha *= 0.78; if (this.alpha < 0.01) this.dead = true; }
  draw() {
    ctx.save(); ctx.globalAlpha = this.alpha;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

class SymbolBurst {
  constructor(cx, cy, eyeR = 20) {
    this.cx = cx; this.cy = cy;
    this.size = eyeR * 1.62; this.alpha = 0.95; this.dead = false;
    this.vel = this.size * 0.55;
  }
  update() {
    this.size += this.vel; this.vel *= 1.12; this.alpha *= 0.88;
    if (this.alpha < 0.01 || this.size > Math.max(canvas.width, canvas.height) * 3) this.dead = true;
  }
  draw() {
    if (!GEASS_CANVAS || this.alpha <= 0) return;
    const s = this.size, h = s * 0.55;
    ctx.save(); ctx.globalAlpha = this.alpha;
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = Math.min(60, s * 0.08) * this.alpha;
    ctx.drawImage(GEASS_CANVAS, this.cx - s * 0.5, this.cy - h * 0.48, s, h);
    ctx.shadowBlur = 0; ctx.restore();
  }
}

class EnergyParticle {
  constructor(cx, cy) {
    this.x = cx + (Math.random() - 0.5) * 40;
    this.y = cy + (Math.random() - 0.5) * 40;
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.8;
    const spd = 2 + Math.random() * 8;
    this.vx = Math.cos(ang) * spd; this.vy = Math.sin(ang) * spd;
    this.r = 1.5 + Math.random() * 4; this.alpha = 1; this.dead = false;
    this.color = Math.random() > 0.5 ? '#ff3300' : '#ff9900';
  }
  update() {
    this.x += this.vx; this.y += this.vy; this.vy += 0.08;
    this.vx *= 0.97; this.r *= 0.97; this.alpha *= 0.91;
    if (this.alpha < 0.01) this.dead = true;
  }
  draw() {
    ctx.save(); ctx.globalAlpha = this.alpha;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 8;
    ctx.fill(); ctx.restore();
  }
}

class BeamStreak {
  constructor(cx, cy) {
    this.ox = cx; this.oy = cy;
    this.ang = Math.random() * Math.PI * 2; this.len = 0;
    this.maxLen = 80 + Math.random() * canvas.width * 0.6;
    this.speed = 35 + Math.random() * 55; this.alpha = 1; this.dead = false;
    this.width = 0.5 + Math.random() * 2;
  }
  update() {
    this.len += this.speed; this.speed *= 0.88; this.alpha *= 0.88;
    if (this.len >= this.maxLen || this.alpha < 0.02) this.dead = true;
  }
  draw() {
    ctx.save(); ctx.globalAlpha = this.alpha * 0.7;
    ctx.strokeStyle = '#ff2200'; ctx.lineWidth = this.width;
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(this.ox, this.oy);
    ctx.lineTo(this.ox + Math.cos(this.ang) * this.len, this.oy + Math.sin(this.ang) * this.len);
    ctx.stroke(); ctx.restore();
  }
}

function spawnGeassFX(cx, cy, eyeR) {
  fxList.length = 0;
  fxList.push(new WhiteFlash());
  fxList.push(new SymbolBurst(cx, cy, eyeR));
  for (let i = 0; i < 20; i++) fxList.push(new EnergyParticle(cx, cy));
  for (let i = 0; i < 10; i++) fxList.push(new BeamStreak(cx, cy));
}

function tickFX() {
  for (let i = fxList.length - 1; i >= 0; i--) {
    fxList[i].update(); fxList[i].draw();
    if (fxList[i].dead) fxList.splice(i, 1);
  }
}

// ── DRAW GEASS EYE ────────────────────────────────────────────
function drawGeassEye(cx, cy, alpha, r) {
  if (alpha <= 0) return;
  ctx.save();
  const irisGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.08);
  irisGrad.addColorStop(0,    `rgba(200,0,0,${0.40 * alpha})`);
  irisGrad.addColorStop(0.55, `rgba(150,0,0,${0.18 * alpha})`);
  irisGrad.addColorStop(1,    `rgba(80,0,0,0)`);
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
  ctx.fillStyle = irisGrad; ctx.fill();
  if (GEASS_CANVAS) {
    const symW = r * 1.62, symH = symW * 0.55;
    ctx.globalAlpha = alpha * 0.80;
    ctx.shadowColor = '#cc0000'; ctx.shadowBlur = r * 0.5 * alpha;
    ctx.drawImage(GEASS_CANVAS, cx - symW * 0.5, cy - symH * 0.48, symW, symH);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ── BLINK DETECTION ───────────────────────────────────────────
function getLeftEAR(lm) {
  const A = Math.abs(lm[159].y - lm[145].y);
  const B = Math.abs(lm[158].y - lm[153].y);
  const C = Math.abs(lm[133].x - lm[33].x);
  if (C < 0.001) return 0.3;
  return (A + B) / (2.0 * C);
}

function updateReleaseDetector(face) {
  if (spaceRelease) { spaceRelease = false; return true; }
  if (!face) { earHistory = []; blinkArmed = false; return false; }
  const ear = getLeftEAR(face);
  earHistory.push(ear);
  if (earHistory.length > 6) earHistory.shift();
  if (ear > EAR_OPEN_THRESH) blinkArmed = true;
  if (blinkArmed && ear < EAR_BLINK_THRESH) { blinkArmed = false; earHistory = []; return true; }
  return false;
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && state === S.CHARGED) { e.preventDefault(); spaceRelease = true; }
});

// ── UPDATE ────────────────────────────────────────────────────
function update() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const face = faceData, hand = handData;

  if (!face) {
    state = S.IDLE; coverFrames = 0; chargeAmt = 0;
    eyeAlpha = Math.max(0, eyeAlpha - 0.06);
    statusEl.textContent = 'Scanning for target...';
    phaseEl.textContent = '— no face —'; phaseEl.className = '';
    statusEl.className = '';
    tickFX(); return;
  }

  const eyePt   = getEyeCenter(face);
  const eyeR    = getEyeRadius(face);
  const covering = hand && isDiagonalPose(hand) && fingersNearEye(hand, eyePt);

  switch (state) {
    case S.IDLE:
      eyeAlpha = Math.max(0, eyeAlpha - 0.06);
      chargeAmt = 0; coverFrames = 0;
      statusEl.textContent = 'Tangan menyamping — telunjuk & tengah di depan mata kiri';
      phaseEl.textContent = '✦ Lelouch pose ✦'; phaseEl.className = '';
      statusEl.className = '';
      if (covering) { state = S.COVERING; playCharge(); }
      break;

    case S.COVERING:
      if (covering) {
        coverFrames++;
        chargeAmt = Math.min(1, coverFrames / CHARGE_FRAMES);
        eyeAlpha  = Math.min(0.5, eyeAlpha + 0.06);
        statusEl.textContent = 'Charging...'; statusEl.className = 'lit';
        phaseEl.textContent = `▶ ${Math.round(chargeAmt * 100)}%`; phaseEl.className = 'active';
        if (chargeAmt >= 1) { state = S.CHARGED; startVoice(); }
      } else { state = S.IDLE; }
      break;

    case S.CHARGED:
      chargeAmt = 1;
      eyeAlpha  = Math.min(1, eyeAlpha + 0.04);
      statusEl.textContent = '⚡ Charged — kedip mata kiri  [SPACE]'; statusEl.className = 'lit';
      phaseEl.textContent = '⚡ Blink left eye ⚡'; phaseEl.className = 'active';
      if (updateReleaseDetector(face)) { state = S.REVEAL; activeFrames = 0; }
      break;

    case S.REVEAL:
      activeFrames++;
      eyeAlpha = Math.max(0, eyeAlpha - 0.06);
      if (activeFrames === 1) {
        playReveal();
        spawnGeassFX(eyePt.x, eyePt.y, eyeR);
        glitchEl.classList.remove('active');
        void glitchEl.offsetWidth;
        glitchEl.classList.add('active');
        setDistortion(1.0);
      }
      if (activeFrames < 20) setDistortion(0.8 - activeFrames * 0.02);
      statusEl.textContent = '⚠ GEASS ACTIVE ⚠'; statusEl.className = 'lit';
      phaseEl.textContent = '— speak your command —'; phaseEl.className = 'active';
      if (activeFrames > 180 || (activeFrames > 30 && fxList.length === 0)) {
        state = S.IDLE; fxList.length = 0;
      }
      break;
  }

  tickFX();
  tickDistortion();
  if (eyeAlpha > 0) drawGeassEye(eyePt.x, eyePt.y, eyeAlpha, eyeR);
}

// ── CHROMATIC ABERRATION ──────────────────────────────────────
const distortR = document.getElementById('distort-r');
const distortB = document.getElementById('distort-b');
let distortAmt = 0, distortTarget = 0;

function setDistortion(amt) { distortTarget = Math.min(1, amt); }

function tickDistortion() {
  distortAmt += (distortTarget - distortAmt) * 0.08;
  distortTarget *= 0.95;
  const shift = distortAmt * 7, opacity = distortAmt * 0.9;
  distortR.style.opacity = opacity; distortB.style.opacity = opacity;
  distortR.style.transform = `scaleX(-1) translateX(${shift}px)`;
  distortB.style.transform = `scaleX(-1) translateX(${-shift}px)`;
  const blur = distortAmt * 1.2, cont = 1 + distortAmt * 0.3;
  video.style.filter = `saturate(0.25) brightness(0.55) blur(${blur}px) contrast(${cont})`;
}

// ── VOICE COMMAND ─────────────────────────────────────────────
const cmdSubtitle = document.getElementById('cmd-subtitle');
const cmdText     = document.getElementById('cmd-text');
const cmdInterim  = document.getElementById('cmd-interim');
let recognition = null, voiceActive = false, cmdFadeTimer = null;

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { console.warn('Speech Recognition not supported'); return; }
  recognition = new SR();
  recognition.continuous = false; recognition.interimResults = true; recognition.lang = 'id-ID';
  recognition.onstart  = () => { voiceActive = true; cmdInterim.textContent = '...'; cmdSubtitle.classList.add('active'); };
  recognition.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    if (interim) cmdInterim.textContent = interim;
    if (final)   showCommand(final.trim());
  };
  recognition.onerror = () => stopVoice();
  recognition.onend   = () => { voiceActive = false; cmdInterim.textContent = ''; if (!cmdText.textContent) cmdSubtitle.classList.remove('active'); };
}

function startVoice() {
  if (!recognition) initVoice();
  if (!recognition || voiceActive) return;
  try { recognition.start(); } catch (e) {}
}

function stopVoice() {
  if (recognition && voiceActive) { try { recognition.stop(); } catch (e) {} }
  voiceActive = false; cmdInterim.textContent = '';
}

function showCommand(text) {
  if (!text) return;
  clearTimeout(cmdFadeTimer);
  cmdText.className = ''; cmdText.textContent = '"' + text + '"';
  void cmdText.offsetWidth; cmdText.classList.add('reveal');
  cmdSubtitle.classList.add('active'); cmdInterim.textContent = '';
  cmdFadeTimer = setTimeout(() => {
    cmdText.classList.remove('reveal'); cmdText.classList.add('fadeout');
    setTimeout(() => { cmdText.textContent = ''; cmdText.className = ''; cmdSubtitle.classList.remove('active'); }, 600);
  }, 5000);
}

// ── MEDIAPIPE ─────────────────────────────────────────────────
const faceMesh = new FaceMesh({ locateFile: f => `./node_modules/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.65, minTrackingConfidence:0.65 });
faceMesh.onResults(r => {
  faceData = r.multiFaceLandmarks?.length ? r.multiFaceLandmarks[0] : null;
  update();
});

const hands = new Hands({ locateFile: f => `./node_modules/@mediapipe/hands/${f}` });
hands.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:0.65, minTrackingConfidence:0.65 });
hands.onResults(r => {
  handData = r.multiHandLandmarks?.length ? r.multiHandLandmarks[0] : null;
});

// ── CAMERA ────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user', width:{ideal:1280}, height:{ideal:720} } });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      resizeCanvas();
      document.getElementById('loading').style.display = 'none';
      loop();
    };
  } catch (e) {
    statusEl.textContent = 'Camera denied. Geass cannot manifest.';
    document.getElementById('loading').style.display = 'none';
  }
}

let tick = 0;
async function loop() {
  if (!video.paused && !video.ended) {
    tick++;
    try {
      await faceMesh.send({ image: video });
      if (tick % 2 === 0) await hands.send({ image: video });
    } catch (e) {}
  }
  requestAnimationFrame(loop);
}

// ── CUSTOM CURSOR ─────────────────────────────────────────────
(function () {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
  let ringX = mouseX, ringY = mouseY;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    dot.style.left = mouseX + 'px'; dot.style.top = mouseY + 'px';
  });

  (function animateRing() {
    ringX += (mouseX - ringX) * 0.14; ringY += (mouseY - ringY) * 0.14;
    ring.style.left = ringX + 'px'; ring.style.top = ringY + 'px';
    requestAnimationFrame(animateRing);
  })();

  const hoverSel = 'a, button, input, label, [role="button"]';
  document.addEventListener('mouseover', e => { if (e.target.closest(hoverSel)) document.body.classList.add('cursor-hover'); });
  document.addEventListener('mouseout',  e => { if (e.target.closest(hoverSel)) document.body.classList.remove('cursor-hover'); });
  document.addEventListener('mousedown', () => document.body.classList.add('cursor-click'));
  document.addEventListener('mouseup',   () => document.body.classList.remove('cursor-click'));
})();

// ── BOOT ──────────────────────────────────────────────────────
window._appReady = false;
window.addEventListener('load', () => {
  if (window._appReady) setTimeout(startCamera, 100);
});
