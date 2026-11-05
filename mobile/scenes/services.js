import {createServiceLogoShape, createServiceShapes} from './service-shapes.js';

const COUNT = 9000;
const DURATION = 1.9;
const TAU = Math.PI * 2;
const SERVICES = ['design', 'development', 'support'];
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const indexOf = value => Number.isInteger(value) ? clamp(value, 0, 2) : 0;
const PALETTES = {
  light: [
    [166,179,195,.16], [155,170,190,.27], [143,160,183,.40], [132,151,177,.54],
    [121,142,168,.67], [110,132,160,.78], [101,124,153,.86], [92,116,146,.92],
    [83,108,140,.97], [75,100,135,1], [98,135,181,.94], [75,111,163,1]
  ],
  dark: [
    [55,105,182,.20], [62,132,223,.33], [80,151,244,.48], [105,172,251,.63],
    [134,192,255,.76], [160,208,255,.85], [186,224,255,.91], [213,236,255,.96],
    [237,248,255,.99], [250,254,255,1], [66,168,255,.91], [193,236,255,1]
  ]
};

function rotation(yaw, pitch, roll) {
  const sy = Math.sin(yaw), co = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const sr = Math.sin(roll), cr = Math.cos(roll);
  return [cr * co - sr * sp * sy, -sr * cp, cr * sy + sr * sp * co,
    sr * co + cr * sp * sy, cr * cp, sr * sy - cr * sp * co,
    -cp * sy, sp, cp * co];
}

function backdrop(g, w, h, cx, cy, floor, dark) {
  g.fillStyle = dark ? '#080d1b' : '#f4f6f8';
  g.fillRect(0, 0, w, h);
  const air = g.createRadialGradient(cx - w * .06, cy - h * .12, 0, cx, cy, Math.max(w,h) * .66);
  air.addColorStop(0, dark ? 'rgba(25,67,139,.25)' : 'rgba(198,218,246,.35)');
  air.addColorStop(.54, dark ? 'rgba(15,42,84,.10)' : 'rgba(223,234,248,.12)');
  air.addColorStop(1, dark ? 'rgba(8,13,27,0)' : 'rgba(244,246,248,0)');
  g.fillStyle = air;
  g.fillRect(0, 0, w, h);
  const s = Math.min(w,h), shadow = g.createRadialGradient(0,0,0,0,0,s * .37);
  shadow.addColorStop(0, dark ? 'rgba(45,118,230,.20)' : 'rgba(69,99,145,.095)');
  shadow.addColorStop(.48, dark ? 'rgba(29,81,174,.07)' : 'rgba(83,115,159,.035)');
  shadow.addColorStop(1, dark ? 'rgba(24,72,160,0)' : 'rgba(83,115,159,0)');
  g.save();
  g.translate(cx, floor);
  g.scale(1, .13);
  g.fillStyle = shadow;
  g.fillRect(-s * .38, -s * .38, s * .76, s * .76);
  g.restore();

  // A quiet framing reference makes this feel like an object study, not a sky.
  g.lineWidth = .6;
  g.strokeStyle = dark ? 'rgba(121,169,232,.17)' : 'rgba(87,116,155,.19)';
  g.beginPath();
  for (const x of [w * .065, w * .935]) for (const y of [h * .12, h * .87]) {
    const side = x < w / 2 ? 1 : -1, end = y < h / 2 ? 1 : -1;
    g.moveTo(x + side * 6, y); g.lineTo(x, y); g.lineTo(x, y + end * 6);
  }
  g.stroke();
}

// Draw the body of the scan sheet behind the grains and its hairline in front.
function scanSheet(g, project, x, top, power, dark, front) {
  const hue = dark ? '101,179,255' : '72,119,178';
  const a = project(x + .315, top, -1.05), b = project(x - .315, top, 1.05);
  const c = project(x - .315,-top,1.05), d = project(x + .315,-top,-1.05);
  g.save(); g.globalAlpha = power;
  if (!front) {
    const wash = g.createLinearGradient(0,a[1],0,d[1]);
    wash.addColorStop(0, `rgba(${hue},.015)`);
    wash.addColorStop(.47, `rgba(${hue},${dark ? .17 : .09})`);
    wash.addColorStop(1, `rgba(${hue},.015)`);
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.closePath();
    g.fillStyle = wash; g.fill();
    g.strokeStyle = `rgba(${hue},${dark ? .46 : .28})`; g.lineWidth = .65; g.stroke();
  } else {
    const p = project(x,top * 1.08,0), q = project(x,-top * 1.08,0);
    const ray = g.createLinearGradient(0,p[1],0,q[1]);
    ray.addColorStop(0, `rgba(${hue},0)`);
    ray.addColorStop(.50, dark ? 'rgba(224,249,255,.96)' : 'rgba(43,99,163,.82)');
    ray.addColorStop(1, `rgba(${hue},0)`);
    g.beginPath(); g.moveTo(...p); g.lineTo(...q);
    g.strokeStyle = `rgba(${hue},${dark ? .13 : .075})`; g.lineWidth = 5; g.stroke();
    g.strokeStyle = ray; g.lineWidth = .95; g.stroke();
    g.fillStyle = `rgba(${hue},.69)`;
    for (const [px,py] of [a,c]) {
      g.fillRect(px - 2.5,py - .5,5,1); g.fillRect(px - .5,py - 2.5,1,5);
    }
  }
  g.restore();
}

/** Three services, one persistent particle population. The host owns the clock. */
export function createServicesHero(options) { return createParticleServices(options, false); }

/** Hoverable service study with the assembled original mark as the resting state. */
export function createHoverServicesHero({service = -1, ...options}) {
  return createParticleServices({...options, service}, true);
}

async function createParticleServices({el, signal, reduced = false, theme = 'light', service = 0}, hover) {
  if (signal?.aborted) throw new DOMException('Scene cancelled', 'AbortError');
  const [services, logo] = await Promise.all([createServiceShapes(COUNT), hover ? createServiceLogoShape(COUNT) : null]);
  if (signal?.aborted) throw new DOMException('Scene cancelled', 'AbortError');
  const shapes = hover ? [...services, logo] : services;
  if (services.length !== 3 || shapes.some(s => s.positions.length !== COUNT * 3 || s.normals.length !== COUNT * 3)) {
    throw new Error('Service particle geometry is incomplete');
  }
  const dark = theme === 'dark';
  const inks = PALETTES[dark ? 'dark' : 'light'].map(([r,g,b,a]) => `rgba(${r},${g},${b},${a})`);
  const canvas = document.createElement('canvas');
  canvas.className = 'mobile-services-canvas';
  if (hover) canvas.dataset.scanner = 'active';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', pointerEvents:'none'});
  const g = canvas.getContext('2d', {alpha:false});
  if (!g) throw new Error('Canvas 2D is unavailable');
  el.append(canvas);

  const positions = new Float32Array(COUNT * 3), normals = new Float32Array(COUNT * 3);
  const fromPositions = new Float32Array(COUNT * 3), fromNormals = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT * 5), packed = new Float32Array(COUNT * 3);
  const depth = new Float32Array(COUNT), lightAt = new Float32Array(COUNT), fronts = new Float32Array(COUNT);
  const scanHits = hover ? new Float32Array(COUNT) : null;
  const visible = new Uint8Array(COUNT);
  const bins = Array.from({length:inks.length}, () => []);
  let seed = 836035;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < seeds.length; i += 5) {
    seeds[i] = rand();
    seeds[i + 1] = .61 + rand() ** 2 * .88;
    seeds[i + 2] = rand() * TAU;
    seeds[i + 3] = rand();
    seeds[i + 4] = rand();
  }

  const selection = value => hover && value === -1 ? -1 : indexOf(value);
  const shapeFor = index => index === -1 ? logo : shapes[index];
  let selected = selection(service), dead = false, dirty = true;
  let w = 1, h = 1, cx = .5, cy = .5, floor = .8, scale = 1;
  let lastT = -1, start = 0, duration = DURATION, progress = 0;
  let pointerX = 0, pointerY = 0;
  let depthField = new Float32Array(1), fieldWidth = 1, fieldHeight = 1;
  let target = shapeFor(selected);

  // Every target shares the same framing: selecting a service never changes zoom.
  const fit = rotation(-.24, .12, -.025);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const shape of shapes) for (let j = 0; j < shape.positions.length; j += 3) {
    const x = shape.positions[j], y = shape.positions[j + 1], z = shape.positions[j + 2];
    const perspective = 10.7 / (10.7 - (fit[6] * x + fit[7] * y + fit[8] * z));
    const px = (fit[0] * x + fit[1] * y + fit[2] * z) * perspective;
    const py = (fit[3] * x + fit[4] * y + fit[5] * z) * perspective;
    minX = Math.min(minX,px); maxX = Math.max(maxX,px);
    minY = Math.min(minY,py); maxY = Math.max(maxY,py);
  }

  function describe() {
    canvas.dataset.service = selected < 0 ? 'logo' : SERVICES[selected];
    canvas.dataset.serviceIndex = String(selected);
    canvas.dataset.morphProgress = progress.toFixed(3);
  }

  function settle() {
    positions.set(target.positions); normals.set(target.normals);
    fromPositions.set(positions); fromNormals.set(normals);
    progress = 1;
    describe();
  }

  function assemble(at) {
    start = at; duration = 2.05; progress = 0;
    for (let i = 0, j = 0, k = 0; i < COUNT; i++, j += 3, k += 5) {
      const angle = seeds[k + 2], reach = .25 + seeds[k + 3] * .90;
      // A compact displaced cloud already carries a hint of the chosen object.
      positions[j] = target.positions[j] * .82 + Math.cos(angle) * reach;
      positions[j + 1] = target.positions[j + 1] * .82 + Math.sin(angle) * reach * .72;
      positions[j + 2] = target.positions[j + 2] * .8 + (seeds[k + 4] - .5) * 1.65;
    }
    normals.set(target.normals);
    fromPositions.set(positions); fromNormals.set(normals);
    dirty = true;
    describe();
  }

  function setService(index, {immediate = false} = {}) {
    if (dead) return;
    const next = selection(index);
    if (next === selected && !immediate && !reduced) return;
    selected = next; target = shapeFor(next);
    if (immediate || reduced) settle();
    else {
      // Capture the rendered state, including the arc of an interrupted morph.
      fromPositions.set(positions); fromNormals.set(normals);
      start = Math.max(0,lastT); duration = hover ? (next < 0 ? 1.05 : .92) : DURATION; progress = 0;
      describe();
    }
    dirty = true;
  }

  function updateMorph(t) {
    if (progress >= 1) return;
    progress = clamp((t - start) / duration);
    if (progress >= 1) { settle(); return; }
    for (let i = 0, j = 0, k = 0; i < COUNT; i++, j += 3, k += 5) {
      const stagger = seeds[k + 3] * .12;
      const p = ease(clamp((progress - stagger) / (1 - stagger)));
      const arc = Math.sin(p * Math.PI), angle = seeds[k + 2];
      const reach = .15 + seeds[k + 4] * .25;
      positions[j] = mix(fromPositions[j], target.positions[j], p) + Math.cos(angle) * arc * reach;
      positions[j + 1] = mix(fromPositions[j + 1], target.positions[j + 1], p) + arc * (.12 + Math.sin(angle) * reach);
      positions[j + 2] = mix(fromPositions[j + 2], target.positions[j + 2], p) + arc * Math.sin(angle * 1.7) * reach * 1.2;
      const nx = mix(fromNormals[j],target.normals[j],p);
      const ny = mix(fromNormals[j + 1],target.normals[j + 1],p);
      const nz = mix(fromNormals[j + 2],target.normals[j + 2],p);
      const length = Math.hypot(nx,ny,nz);
      normals[j] = length > .0001 ? nx / length : target.normals[j];
      normals[j + 1] = length > .0001 ? ny / length : target.normals[j + 1];
      normals[j + 2] = length > .0001 ? nz / length : target.normals[j + 2];
    }
    describe();
  }

  function resize(width, height) {
    if (dead) return;
    w = Math.max(1, Number(width) || 1); h = Math.max(1, Number(height) || 1);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.65, 1600 / w, 1200 / h, Math.sqrt(1600000 / (w * h)));
    scale = Math.min(w * .80 / (maxX - minX), h * .69 / (maxY - minY));
    cx = w * .5 - (minX + maxX) * .5 * scale;
    cy = h * .48 + (minY + maxY) * .5 * scale;
    floor = Math.min(h * .84, cy - minY * scale + h * .045);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    fieldWidth = Math.ceil(w / 3.8) + 2; fieldHeight = Math.ceil(h / 3.8) + 2;
    depthField = new Float32Array(fieldWidth * fieldHeight);
    g.setTransform(dpr,0,0,dpr,0,0);
    dirty = true;
    if (reduced) frame(0,0);
  }

  function frame(time, dt = 0, input = {}) {
    if (dead || (reduced && !dirty)) return;
    const t = reduced ? 0 : Math.max(0, Number(time) || 0);
    if (!reduced && t + .001 < lastT) {
      pointerX = pointerY = 0;
      if (hover) settle();
      else assemble(t);
    }
    const step = reduced ? 0 : clamp(Number(dt) || 0, 0, .05);
    const active = input.active || input.dragging;
    const blend = 1 - Math.exp(-7 * step);
    pointerX = mix(pointerX, active ? clamp(Number(input.x) || 0,-1,1) : 0, blend);
    pointerY = mix(pointerY, active ? clamp(Number(input.y) || 0,-1,1) : 0, blend);
    updateMorph(t);
    lastT = t; dirty = false;

    const yaw = -.24 + pointerX * .26 + (reduced ? 0 : Math.sin(t * .23) * .08);
    const pitch = .12 + pointerY * .13 + (reduced ? 0 : Math.sin(t * .31) * .025);
    const r = rotation(yaw,pitch,-.025 - pointerX * .025);
    const center = cx + pointerX * w * .012;
    const height = cy + pointerY * h * .009 + (reduced ? 0 : Math.sin(t * .59) * h * .006);
    backdrop(g,w,h,cx,cy,floor,dark);
    const scanX = hover ? (reduced ? -.53 : 2.37 * Math.sin(t * .82 - .23)) : 0;
    const power = hover ? (reduced ? .61 : .72 + .22 * Math.sin(progress * Math.PI)) : 0;
    const top = Math.min(2.17,h * .34 / scale);
    const project = hover ? (x,y,z) => {
      const inv = scale * 10.7 / (10.7 - (r[6] * x + r[7] * y + r[8] * z));
      return [center + (r[0] * x + r[1] * y + r[2] * z) * inv, height - (r[3] * x + r[4] * y + r[5] * z) * inv];
    } : null;
    if (hover) scanSheet(g,project,scanX,top,power,dark,false);
    for (const bin of bins) bin.length = 0;
    depthField.fill(-Infinity); visible.fill(0);
    const dotScale = clamp(scale / 66,.70,1.38);
    for (let i = 0, j = 0, k = 0; i < COUNT; i++, j += 3, k += 5) {
      const px = positions[j], py = positions[j + 1], pz = positions[j + 2];
      const z = r[6] * px + r[7] * py + r[8] * pz;
      const inv = 10.7 / (10.7 - z);
      const sx = center + (r[0] * px + r[1] * py + r[2] * pz) * scale * inv;
      const sy = height - (r[3] * px + r[4] * py + r[5] * pz) * scale * inv;
      if (sx < -2 || sx > w + 2 || sy < -2 || sy > h + 2) continue;
      const nx = r[0] * normals[j] + r[1] * normals[j + 1] + r[2] * normals[j + 2];
      const ny = r[3] * normals[j] + r[4] * normals[j + 1] + r[5] * normals[j + 2];
      const nz = r[6] * normals[j] + r[7] * normals[j + 1] + r[8] * normals[j + 2];
      const front = smooth(-.34,.18,nz), key = Math.max(0,-.49 * nx + .43 * ny + .758 * nz);
      const rim = Math.max(0,.84 * nx + .37 * ny - .395 * nz);
      const light = .23 + key * .59 + rim * .18 + Math.max(0,nz) * .15;
      const tone = seeds[k];
      const illumination = mix(.22,dark ? .89 : .86,front) * mix(.76,1,light) + (tone - .37) * .24;
      const hot = hover ? power * (1 - smooth(.075,.45,Math.abs(px + .30 * pz - scanX))) : 0;
      if (hover) scanHits[i] = hot;
      const size = seeds[k + 1] * dotScale * inv * (dark ? 1.06 : 1.08) * (1 + hot * .17);
      packed[j] = sx - size * .5; packed[j + 1] = sy - size * .5; packed[j + 2] = size;
      visible[i] = 1; depth[i] = z; lightAt[i] = illumination; fronts[i] = front * light;
      const fx = clamp(Math.floor(sx / 3.8) + 1,1,fieldWidth - 2);
      const fy = clamp(Math.floor(sy / 3.8) + 1,1,fieldHeight - 2);
      const cell = fy * fieldWidth + fx;
      depthField[cell] = Math.max(depthField[cell],z);
    }
    // A soft depth field lets front grains veil rear surfaces. No solid mesh is
    // drawn: the gaps between dots remain open, but stacked slabs stay readable.
    for (let i = 0, j = 0, k = 0; i < COUNT; i++, j += 3, k += 5) {
      if (!visible[i]) continue;
      const fx = clamp(Math.floor((packed[j] + packed[j + 2] * .5) / 3.8) + 1,1,fieldWidth - 2);
      const fy = clamp(Math.floor((packed[j + 1] + packed[j + 2] * .5) / 3.8) + 1,1,fieldHeight - 2);
      const cell = fy * fieldWidth + fx;
      let nearest = depth[i];
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
        nearest = Math.max(nearest,depthField[cell + yy * fieldWidth + xx]);
      }
      const clear = 1 - smooth(.19,.43,nearest - depth[i]);
      const illumination = lightAt[i] * mix(.12,1,clear);
      let band = Math.floor(clamp(illumination,0,.999) * 10);
      if (seeds[k] > .965 && fronts[i] > .69 && clear > .98) band = dark ? 11 : 10;
      if (hover && scanHits[i] > .30 && clear > .62 && seeds[k] > .25) band = scanHits[i] > .63 && seeds[k] > .68 ? 11 : 10;
      const shrink = mix(.7,1,clear);
      packed[j] += packed[j + 2] * (1 - shrink) * .5;
      packed[j + 1] += packed[j + 2] * (1 - shrink) * .5;
      packed[j + 2] *= shrink;
      bins[band].push(j);
    }
    for (let band = 0; band < inks.length; band++) {
      g.fillStyle = inks[band];
      for (const j of bins[band]) g.fillRect(packed[j],packed[j + 1],packed[j + 2],packed[j + 2]);
    }
    if (hover) scanSheet(g,project,scanX,top,power,dark,true);
  }

  function dispose() {
    if (dead) return;
    dead = true;
    signal?.removeEventListener('abort',dispose);
    canvas.remove();
    canvas.width = canvas.height = 1;
    for (const bin of bins) bin.length = 0;
  }

  if (reduced || hover) settle();
  else assemble(0);
  signal?.addEventListener('abort',dispose,{once:true});
  const box = el.getBoundingClientRect();
  resize(box.width,box.height);
  return {frame,resize,dispose,setService};
}
