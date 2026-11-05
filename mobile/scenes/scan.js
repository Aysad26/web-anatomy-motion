import * as THREE from 'three';
import {loadMark} from '../../mark-kit.js';

const TAU = Math.PI * 2;
const DENSITY = 6800;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
const random = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

function disposeMark(mark) {
  mark.traverse(({geometry, material}) => {
    geometry?.dispose();
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

function sampleMonogram(mark, density) {
  const rand = random(631043), faces = [], edges = new Map();
  const a = new THREE.Vector3(), b = a.clone(), c = a.clone(), n = a.clone(), d = a.clone();
  const keyOf = (p) => [p.x, p.y, p.z].map((value) => Math.round(value * 1e5)).join(',');
  let surfaceArea = 0, edgeLength = 0;
  mark.updateMatrixWorld(true);
  mark.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const {geometry, matrixWorld} = mesh;
    const position = geometry.getAttribute('position'), index = geometry.index;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrixWorld);
      n.subVectors(b, a).cross(d.subVectors(c, a));
      const area = n.length() / 2;
      if (area < 1e-8) continue;
      const face = {a: a.clone(), b: b.clone(), c: c.clone(), n: n.clone().normalize(), end: surfaceArea += area};
      const id = faces.push(face) - 1;
      for (const [p, q] of [[face.a, face.b], [face.b, face.c], [face.c, face.a]]) {
        const key = [keyOf(p), keyOf(q)].sort().join('|');
        if (!edges.has(key)) edges.set(key, {p, q, ids: []});
        edges.get(key).ids.push(id);
      }
    }
  });
  if (!faces.length) throw new Error('The WA monogram has no surfaces');
  // Sample actual creases, with no extra dots along coplanar triangle seams.
  const creases = [...edges.values()].filter(({ids}) => ids.length === 1 ||
    ids.some((id) => faces[id].n.dot(faces[ids[0]].n) < .96));
  for (const edge of creases) edge.end = edgeLength += edge.p.distanceTo(edge.q);
  const onFace = creases.length ? Math.round(density * .88) : density;
  const data = new Float32Array(density * 10), normals = new Uint16Array(density), v = a.clone();
  let faceId = 0, edgeId = 0;
  for (let i = 0; i < density; i++) {
    const crease = i >= onFace;
    if (crease) {
      const at = edgeLength * (i - onFace + rand()) / (density - onFace);
      while (edgeId + 1 < creases.length && creases[edgeId].end < at) edgeId++;
      const edge = creases[edgeId], start = creases[edgeId - 1]?.end || 0;
      v.copy(edge.p).lerp(edge.q, (at - start) / (edge.end - start));
      normals[i] = edge.ids[Math.floor(rand() * edge.ids.length)];
    } else {
      const at = surfaceArea * (i + rand()) / onFace;
      while (faceId + 1 < faces.length && faces[faceId].end < at) faceId++;
      const face = faces[faceId], u = Math.sqrt(rand()), k = rand();
      v.copy(face.a).multiplyScalar(1 - u).addScaledVector(face.b, u * (1 - k)).addScaledVector(face.c, u * k);
      normals[i] = faceId;
    }
    const j = i * 10, theta = rand() * TAU;
    const spray = .22 + rand() ** .72 * 1.48;
    data[j] = v.x; data[j + 1] = v.y; data[j + 2] = v.z;
    data[j + 3] = Math.cos(theta) * spray * .94 + .42;
    data[j + 4] = Math.sin(theta) * spray * .75;
    data[j + 5] = (rand() - .5) * 2.5;
    data[j + 6] = rand();
    data[j + 7] = (crease ? .63 : .70) + rand() ** 2.20 * .94;
    data[j + 8] = v.x + .30 * v.z - (rand() - .5) * .19;
    data[j + 9] = Math.sin(theta);
  }
  return {data, normals, faces};
}

// A slate-blue palette keeps the cloud soft but legible on porcelain; the dark
// edition uses exactly the same physical motion with cold, luminous grains.
const PALETTES = {
  light: [
    [166, 179, 195, .16], [155, 170, 190, .27], [143, 160, 183, .40], [132, 151, 177, .54],
    [121, 142, 168, .67], [110, 132, 160, .78], [101, 124, 153, .86], [92, 116, 146, .92],
    [83, 108, 140, .97], [75, 100, 135, 1], [98, 135, 181, .94], [75, 111, 163, 1]
  ],
  dark: [
    [55, 105, 182, .20], [62, 132, 223, .33], [80, 151, 244, .48], [105, 172, 251, .63],
    [134, 192, 255, .76], [160, 208, 255, .85], [186, 224, 255, .91], [213, 236, 255, .96],
    [237, 248, 255, .99], [250, 254, 255, 1], [66, 168, 255, .91], [193, 236, 255, 1]
  ]
};
const toInk = palette => palette.map(([r, g, b, a]) => `rgba(${r},${g},${b},${a})`);

function background(g, w, h, cx, cy, t, power, stars, dark) {
  const s = Math.min(w, h), floor = h * .80;
  g.fillStyle = dark ? '#080d1b' : '#f4f6f8';
  g.fillRect(0, 0, w, h);
  const air = g.createRadialGradient(cx * 1.16, cy * .91, 0, cx, cy, Math.max(w, h) * .62);
  air.addColorStop(0, dark ? `rgba(24,65,137,${.23 + power * .07})` : `rgba(197,215,249,${.39 + power * .09})`);
  air.addColorStop(.52, dark ? 'rgba(12,40,91,.12)' : 'rgba(225,233,248,.16)');
  air.addColorStop(1, dark ? 'rgba(7,15,33,0)' : 'rgba(244,246,248,0)');
  g.fillStyle = air;
  g.fillRect(0, 0, w, h);

  // One soft contact shadow and a few measurement hairlines ground the volume.
  const shadow = g.createRadialGradient(0, 0, 0, 0, 0, s * .39);
  shadow.addColorStop(0, dark ? `rgba(42,117,241,${.18 + power * .07})` : `rgba(59,82,127,${.11 + power * .035})`);
  shadow.addColorStop(.55, dark ? 'rgba(28,83,188,.07)' : 'rgba(76,108,164,.045)');
  shadow.addColorStop(1, dark ? 'rgba(24,83,196,0)' : 'rgba(76,108,164,0)');
  g.save();
  g.translate(cx, floor);
  g.scale(1, .145);
  g.fillStyle = shadow;
  g.fillRect(-s * .4, -s * .4, s * .8, s * .8);
  g.restore();

  g.strokeStyle = dark ? 'rgba(117,165,234,.16)' : 'rgba(65,94,145,.14)';
  g.lineWidth = .6;
  g.beginPath();
  const baseline = h * .89;
  for (let i = -6; i <= 6; i++) {
    const x = cx + i * w * .049;
    g.moveTo(x, baseline);
    g.lineTo(x, baseline + (i % 3 === 0 ? 5 : 2.5));
  }
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const x = cx + side * w * .435, y = cy + end * Math.min(h * .335, w * .32);
    g.moveTo(x - side * 7, y);
    g.lineTo(x, y);
    g.lineTo(x, y - end * 7);
  }
  g.stroke();

  // Quiet, stationary dust: no flickering background competing with the mark.
  for (let i = 0; i < stars.length; i += 4) {
    const x = stars[i] * w, y = stars[i + 1] * h;
    const alpha = stars[i + 3] * (dark ? .18 : .11);
    g.fillStyle = dark ? `rgba(151,191,245,${alpha})` : `rgba(40,74,127,${alpha})`;
    g.fillRect(x, y, .65, .65);
  }
}

function scanner(g, p, x, power, w, h, front, dark) {
  if (power < .012) return;
  const top = Math.min(2.12, h / w * 3.27), bottom = -top * .98;
  const a = p(x + .315, top, -1.05), b = p(x - .315, top, 1.05);
  const c = p(x - .315, bottom, 1.05), d = p(x + .315, bottom, -1.05);
  const centerA = p(x - .035, top * 1.13, .115), centerB = p(x - .035, bottom * 1.13, .115);
  const hue = dark ? '86,165,255' : '85,124,177';
  const ray = g.createLinearGradient(0, centerA[1], 0, centerB[1]);
  ray.addColorStop(0, `rgba(${hue},0)`);
  ray.addColorStop(.17, `rgba(${hue},.55)`);
  ray.addColorStop(.53, dark ? 'rgba(224,246,255,1)' : 'rgba(65,101,154,.98)');
  ray.addColorStop(.82, `rgba(${hue},.66)`);
  ray.addColorStop(1, `rgba(${hue},0)`);
  g.save();
  g.globalAlpha = power;
  if (!front) {
    const sheet = g.createLinearGradient(a[0], a[1], c[0], c[1]);
    sheet.addColorStop(0, `rgba(${hue},.015)`);
    sheet.addColorStop(.5, `rgba(${hue},${dark ? .13 : .075})`);
    sheet.addColorStop(1, `rgba(${hue},.018)`);
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath();
    g.fillStyle = sheet; g.fill();
    g.strokeStyle = `rgba(${hue},${dark ? .31 : .24})`; g.lineWidth = .65; g.stroke();
    g.beginPath();
    for (let j = 1; j <= 7; j++) {
      const q = j / 8, y = mix(top, bottom, q), p1 = p(x + .315, y, -1.05), p2 = p(x + .255, y, -.85);
      g.moveTo(...p1); g.lineTo(...p2);
    }
    g.strokeStyle = `rgba(${hue},.45)`; g.stroke();
  } else {
    g.strokeStyle = `rgba(${hue},${dark ? .14 : .07})`; g.lineWidth = 6;
    g.beginPath(); g.moveTo(...centerA); g.lineTo(...centerB); g.stroke();
    g.strokeStyle = ray; g.lineWidth = .95; g.stroke();
    for (const [px, py] of [a, c]) {
      g.fillStyle = `rgba(${hue},.88)`;
      g.fillRect(px - 2, py - .5, 4, 1);
      g.fillRect(px - .5, py - 2, 1, 4);
    }
  }
  g.restore();
}

export async function createScanHero({el, signal, reduced = false, theme = 'light'}) {
  const dark = theme === 'dark', tones = toInk(PALETTES[dark ? 'dark' : 'light']);
  const density = dark ? DENSITY : 7200;
  const mark = await loadMark();
  let model;
  try {
    if (signal?.aborted) throw new DOMException('Scene cancelled', 'AbortError');
    model = sampleMonogram(mark, density);
  } finally {
    disposeMark(mark);
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'mobile-scan-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none'});
  const g = canvas.getContext('2d', {alpha: false});
  if (!g) throw new Error('Canvas 2D is unavailable');
  el.append(canvas);

  const rand = random(560903), stars = new Float32Array(34 * 4);
  for (let i = 0; i < stars.length; i += 4) {
    stars[i] = rand(); stars[i + 1] = rand() * .84 + .05;
    stars[i + 2] = rand(); stars[i + 3] = .33 + rand() * .67;
  }
  const packed = new Float32Array(density * 3), bins = Array.from({length: tones.length}, () => []);
  const faceLight = new Float32Array(model.faces.length);
  const faceFront = new Float32Array(model.faces.length);
  let w = 1, h = 1, cx = .5, cy = .5, dpr = 1, scale = 1, dead = false, dirty = true;
  let lastT = -1, pointerX = 0, pointerY = 0, lastPressed = false, lastDragging = false;
  let manualMode = 'idle', manualX = -4, target = -4, manualPower = 0, direction = 1, queued = null;

  function resize(width, height) {
    if (dead) return;
    w = Math.max(1, width); h = Math.max(1, height);
    cx = w * .5; cy = h * .48;
    dpr = Math.min(globalThis.devicePixelRatio || 1, 1.65, 1600 / w, 1200 / h, Math.sqrt(1600000 / (w * h)));
    scale = Math.min(w / 6.55, h / 4.95);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
    if (reduced) frame(0, 0);
  }

  function startManual(x, isDrag) {
    const side = x < 0 ? -1 : 1;
    if (manualPower < .025) manualX = x * 3.55;
    // The scanning sheet appears at the contact point on the first frame.
    manualPower = Math.max(manualPower, .20);
    direction = -side;
    manualMode = isDrag ? 'hold' : 'sweep';
    target = isDrag ? x * 3.55 : direction * 4.15;
  }

  function frame(time, dt, input = {}) {
    if (dead || (reduced && !dirty)) return;
    const t = reduced ? 2.7 : Math.max(0, time || 0);
    if (t + .001 < lastT) {
      pointerX = pointerY = manualPower = 0;
      manualX = target = -4; manualMode = 'idle'; queued = null;
      lastPressed = lastDragging = false;
    }
    lastT = t;
    dirty = false;
    // A resize can redraw at dt=0 while paused; it must not advance a scan.
    const step = clamp(Number(dt) || 0, 0, 1 / 25);
    const x = clamp(input.x || 0, -1, 1), y = clamp(input.y || 0, -1, 1);
    pointerX = damp(pointerX, !reduced && (input.active || input.dragging) ? x : 0, 7, step);
    pointerY = damp(pointerY, !reduced && (input.active || input.dragging) ? y : 0, 7, step);

    const intro = smooth(.10, 2.10, t), ongoing = t < 2.10;
    const scanFraction = clamp((t - .10) / 1.94);
    const buildX = mix(-3.85, 3.89, scanFraction + .042 * Math.sin(scanFraction * TAU));
    const introPower = smooth(.06, .34, t) * (1 - smooth(1.76, 2.10, t));
    const pressed = !reduced && Boolean(input.pressed), dragging = !reduced && Boolean(input.dragging);
    const pressX = clamp(input.pressX ?? x, -1, 1);
    if ((pressed && !lastPressed) || (dragging && !lastDragging)) {
      if (ongoing) queued = {x: dragging ? x : pressX};
      else startManual(dragging ? x : pressX, dragging);
    }
    if (!ongoing && queued) { startManual(dragging ? x : queued.x, dragging); queued = null; }
    if (!ongoing && dragging) {
      if (manualMode !== 'hold') startManual(x, true);
      target = x * 3.55;
      const delta = target - manualX;
      if (Math.abs(delta) > .12) direction = Math.sign(delta);
    } else if (manualMode === 'hold') {
      manualMode = 'sweep';
      target = direction * 4.15;
    }
    if (manualMode === 'sweep') {
      const delta = target - manualX;
      manualX += Math.sign(delta) * Math.min(Math.abs(delta), step * (3.75 + Math.min(Math.abs(delta), 1.4) * .8));
      if (Math.abs(target - manualX) < .006) manualMode = 'idle';
    } else if (manualMode === 'hold') manualX = damp(manualX, target, 12, step);
    manualPower = damp(manualPower, manualMode === 'idle' ? 0 : .99, manualMode === 'idle' ? 10 : 13, step);
    lastPressed = pressed; lastDragging = dragging;

    const idleT = t < 5.8 ? -1 : (t - 5.8) % 9.8;
    const idleX = mix(-3.8, 3.8, clamp(idleT / 2.7));
    const idlePower = !reduced && idleT >= 0 && idleT <= 2.7
      ? .30 * Math.sin(idleT / 2.7 * Math.PI) * (1 - smooth(0, .46, manualPower)) : 0;
    const sweepX = ongoing ? buildX : manualX;
    const power = reduced ? 0 : ongoing ? introPower : manualPower;
    const yaw = -.19 + .23 * pointerX + (reduced ? 0 : Math.sin(t * .33) * .115 + (1 - intro) * -.26);
    const pitch = .095 + .13 * pointerY + (reduced ? 0 : Math.sin(t * .48) * .035);
    const roll = -.025 - .036 * pointerX;
    const sy = Math.sin(yaw), co = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    const sr = Math.sin(roll), cr = Math.cos(roll);
    const ax = cr * co - sr * sp * sy, ay = -sr * cp, az = cr * sy + sr * sp * co;
    const bx = sr * co + cr * sp * sy, by = cr * cp, bz = sr * sy - cr * sp * co;
    const zx = -cp * sy, zy = sp, zz = cp * co;
    const height = cy + (reduced ? 0 : Math.sin(t * .77) * h * .012) + pointerY * h * .012;
    const center = cx + pointerX * w * .015;
    const project = (px, py, pz) => {
      const inv = scale * 10.7 / (10.7 - (zx * px + zy * py + zz * pz));
      return [center + (ax * px + ay * py + az * pz) * inv, height - (bx * px + by * py + bz * pz) * inv];
    };

    background(g, w, h, cx, cy, t, Math.max(power, idlePower), stars, dark);
    scanner(g, project, idleX, idlePower, w, h, false, dark);
    scanner(g, project, sweepX, power, w, h, false, dark);
    for (let i = 0; i < model.faces.length; i++) {
      const {x: nx, y: ny, z: nz} = model.faces[i].n;
      const vx = ax * nx + ay * ny + az * nz, vy = bx * nx + by * ny + bz * nz;
      const vz = zx * nx + zy * ny + zz * nz;
      const key = Math.max(0, -.49 * vx + .43 * vy + .758 * vz);
      const rim = Math.max(0, .84 * vx + .37 * vy - .395 * vz);
      faceLight[i] = .21 + key * .58 + rim * .18 + Math.max(0, vz) * .17;
      faceFront[i] = smooth(-.40, .16, vz);
    }
    for (const bin of bins) bin.length = 0;
    const {data, normals} = model, dotScale = clamp(scale / 53, .68, 1.38);
    const visible = .08 + .92 * smooth(0, .30, t);
    for (let i = 0, j = 0; i < density; i++, j += 10) {
      const tone = data[j + 6], scanAt = data[j + 8];
      const assembled = ongoing ? smooth(-.26, .91, buildX - scanAt) : 1;
      const unbound = 1 - assembled;
      const hot = Math.max(power * (1 - smooth(.085, .62, Math.abs(sweepX - scanAt))),
        idlePower > 0 ? idlePower * (1 - smooth(.085, .62, Math.abs(idleX - scanAt))) : 0);
      const shake = !reduced && tone > .59 ? hot * .30 : 0;
      const swirl = (unbound > 0 && assembled > 0) ? Math.sin(assembled * Math.PI) * .58 : 0;
      const px = data[j] + data[j + 3] * (unbound + shake) + swirl * .25;
      const py = data[j + 1] + data[j + 4] * (unbound + shake) + swirl * data[j + 9];
      const pz = data[j + 2] + data[j + 5] * (unbound + shake) - swirl * .72;
      const inv = 10.7 / (10.7 - (zx * px + zy * py + zz * pz));
      const q = i * 3;
      const sx = center + (ax * px + ay * py + az * pz) * scale * inv;
      const yy = height - (bx * px + by * py + bz * pz) * scale * inv;
      if (sx < 0 || sx > w || yy < 0 || yy > h) continue;
      const front = faceFront[normals[i]], edge = i >= Math.round(density * .88);
      const lit = dark ? mix(.27, .81, front) * mix(.77, 1, faceLight[normals[i]]) + (edge ? .075 : 0)
        : mix(.34, .84, front) * mix(.80, 1, faceLight[normals[i]]) + (edge ? .09 : 0);
      let band = Math.floor(clamp(mix(.12 + tone * .23, lit + (tone - .38) * .30, assembled) * visible, 0, .994) * 10);
      if (hot > .45 && tone > .39) band = hot > .68 && tone > .78 ? 11 : 10;
      const gleam = !reduced && tone > .985 ? .22 * (1 + Math.sin(t * 1.7 + j)) : 0;
      const size = data[j + 7] * dotScale * inv * visible * (mix(.65, 1.02, assembled) + hot * .34 + gleam) * (dark ? edge ? 1.17 : 1.09 : edge ? 1.22 : 1.12);
      if (size < .25) continue;
      packed[q] = sx - size * .5; packed[q + 1] = yy - size * .5; packed[q + 2] = size;
      bins[band].push(q);
    }
    for (let b = 0; b < tones.length; b++) {
      g.fillStyle = tones[b];
      for (const q of bins[b]) g.fillRect(packed[q], packed[q + 1], packed[q + 2], packed[q + 2]);
    }
    scanner(g, project, idleX, idlePower, w, h, true, dark);
    scanner(g, project, sweepX, power, w, h, true, dark);
  }

  function dispose() {
    if (dead) return;
    dead = true;
    canvas.remove();
    canvas.width = canvas.height = 1;
  }

  const box = el.getBoundingClientRect();
  resize(box.width, box.height);
  return {frame, resize, dispose};
}
