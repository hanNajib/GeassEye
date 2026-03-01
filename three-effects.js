import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
//  1. INTRO PARTICLE FIELD
// ═══════════════════════════════════════════════════════════════
(function initIntroParticles() {
  const dialog = document.getElementById('intro-dialog');

  const introCanvas = document.createElement('canvas');
  introCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  dialog.insertBefore(introCanvas, dialog.firstChild);

  let W = window.innerWidth, H = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ canvas: introCanvas, antialias: false, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 1, 2000);
  camera.position.set(0, 0, 420);

  const group = new THREE.Group();
  scene.add(group);

  // Dust cloud (2500 particles)
  const N   = 2500;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r     = 180 + Math.random() * 340;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi) - 100;
    const br = 0.12 + Math.random() * 0.65;
    col[i*3] = br; col[i*3+1] = 0; col[i*3+2] = 0;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 1.6, vertexColors: true,
    transparent: true, opacity: 0.72,
    sizeAttenuation: true, depthWrite: false
  })));

  // Bright accent stars (130 particles)
  const SN   = 130;
  const sPos = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    sPos[i*3]   = (Math.random() - 0.5) * 1000;
    sPos[i*3+1] = (Math.random() - 0.5) * 1000;
    sPos[i*3+2] = (Math.random() - 0.5) * 450 - 80;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 3.2, color: 0xff1100,
    transparent: true, opacity: 0.88,
    sizeAttenuation: true, depthWrite: false
  })));

  let rafId;
  function animate() {
    rafId = requestAnimationFrame(animate);
    group.rotation.y += 0.0007;
    group.rotation.x += 0.00025;
    renderer.render(scene, camera);
  }
  animate();

  // Cleanup when dialog is hidden
  new MutationObserver(() => {
    if (dialog.style.display === 'none') {
      cancelAnimationFrame(rafId);
      renderer.dispose();
    }
  }).observe(dialog, { attributes: true, attributeFilter: ['style'] });

  window.addEventListener('resize', () => {
    W = window.innerWidth; H = window.innerHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });
})();


// ═══════════════════════════════════════════════════════════════
//  2. REVEAL 3D PARTICLE BURST  (removed)
// ═══════════════════════════════════════════════════════════════
/* (function initRevealBurst() {
  let W = window.innerWidth, H = window.innerHeight;

  const oc = document.createElement('canvas');
  oc.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:45;display:block;';
  document.body.appendChild(oc);

  const renderer = new THREE.WebGLRenderer({ canvas: oc, antialias: false, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;

  // Ortho camera in screen-space (top-left origin, y goes negative downward)
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, -500, 500);
  camera.position.z = 100;
  const scene = new THREE.Scene();

  const BURST_N = 280;
  const bPos = new Float32Array(BURST_N * 3);
  const bCol = new Float32Array(BURST_N * 3);
  const vx   = new Float32Array(BURST_N);
  const vy   = new Float32Array(BURST_N);
  const vz   = new Float32Array(BURST_N);

  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color',    new THREE.BufferAttribute(bCol, 3));

  const bMat = new THREE.PointsMaterial({
    size: 4.5, vertexColors: true,
    transparent: true, opacity: 1,
    sizeAttenuation: false, depthWrite: false
  });
  scene.add(new THREE.Points(bGeo, bMat));

  let active = false, burstTime = 0;
  const BURST_DUR = 3.2;
  let lastT = performance.now();

  window.spawnReveal3D = function (screenX, screenY) {
    const wx = screenX, wy = -screenY;
    for (let i = 0; i < BURST_N; i++) {
      bPos[i*3] = wx; bPos[i*3+1] = wy; bPos[i*3+2] = 0;
      const ang = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 14;
      vx[i] = Math.cos(ang) * spd;
      vy[i] = -Math.sin(ang) * spd * 0.5;
      vz[i] = (Math.random() - 0.5) * 5;
      const t = Math.random();
      if      (t < 0.25) { bCol[i*3]=1;    bCol[i*3+1]=0.55; bCol[i*3+2]=0.25; }
      else if (t < 0.65) { bCol[i*3]=1;    bCol[i*3+1]=0.08+Math.random()*0.18; bCol[i*3+2]=0; }
      else               { bCol[i*3]=0.45+Math.random()*0.55; bCol[i*3+1]=0; bCol[i*3+2]=0; }
    }
    bGeo.attributes.position.needsUpdate = true;
    bGeo.attributes.color.needsUpdate    = true;
    bMat.opacity = 1; bMat.size = 4.5;
    active = true; burstTime = 0; lastT = performance.now();
  };

  function animateBurst() {
    requestAnimationFrame(animateBurst);
    const now = performance.now();
    const dt  = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (!active) { renderer.clear(); return; }
    burstTime += dt;
    const p = burstTime / BURST_DUR;
    if (p >= 1) { active = false; renderer.clear(); return; }
    for (let i = 0; i < BURST_N; i++) {
      bPos[i*3]   += vx[i]; bPos[i*3+1] += vy[i]; bPos[i*3+2] += vz[i];
      vx[i] *= 0.955; vy[i] *= 0.955; vz[i] *= 0.955;
    }
    bGeo.attributes.position.needsUpdate = true;
    bMat.opacity = Math.max(0, 1 - p * 1.6);
    bMat.size    = Math.max(1, 4.5 - p * 3);
    renderer.render(scene, camera);
  }
  animateBurst();

  window.addEventListener('resize', () => {
    W = window.innerWidth; H = window.innerHeight;
    camera.right = W; camera.bottom = -H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });
})(); */
