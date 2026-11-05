import * as THREE from 'three';
import { loadMark, makeStudio } from '../mark-kit.js';
import { createLightField, createLightFieldCanvas, LIGHT_FIELD_SHADER } from './optics-light-field.js';

const BLUE = 0x1748e6;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const ease = (a, b, t) => {
  const s = clamp((t - a) / (b - a), 0, 1);
  return s * s * (3 - 2 * s);
};
const getDpr = () => Math.min(window.devicePixelRatio || 1, 1.75);
const CSS_CANVAS = 'display:block;position:absolute;inset:0;width:100%;height:100%;pointer-events:none';

function rendererFor(el) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setPixelRatio(getDpr());
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.domElement.style.cssText = CSS_CANVAS;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  el.append(renderer.domElement);
  return renderer;
}

function releaseRenderer(renderer) {
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
}

function disposeTree(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function sceneDimensions(mark) {
  mark.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mark);
  const size = box.getSize(new THREE.Vector3());
  return { box, size, center: box.getCenter(new THREE.Vector3()) };
}

function cameraFor() {
  return new THREE.PerspectiveCamera(34, 1, 0.1, 80);
}

function fitCamera(camera, w, h, size, framing = 1) {
  camera.aspect = Math.max(0.1, w / Math.max(1, h));
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const z = Math.max((size.x * 1.10 + 0.75) / (2 * tan * camera.aspect * 0.78), (size.y + 0.60) / (2 * tan * 0.68)) + size.z * 0.4;
  camera.position.set(0, 0.16, z * framing);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function localFaces(mesh, inverseRoot) {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const matrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
  const vertex = new THREE.Vector3();
  const faces = [];
  for (let i = 0; i < (index ? index.count : position.count); i += 3) {
    const face = [];
    for (let j = 0; j < 3; j++) {
      vertex.fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(matrix);
      face.push([vertex.x, vertex.y, vertex.z]);
    }
    faces.push(face);
  }
  return faces;
}

function intersects(faces, x) {
  const edges = [];
  const points = new Map();
  const neighbors = new Map();
  const unique = new Set();
  const epsilon = 1e-6;
  const key = p => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
  const link = (a, b) => {
    const aa = key(a), bb = key(b);
    if (aa === bb) return;
    const hash = aa < bb ? `${aa}|${bb}` : `${bb}|${aa}`;
    if (unique.has(hash)) return;
    unique.add(hash);
    points.set(aa, a); points.set(bb, b);
    if (!neighbors.has(aa)) neighbors.set(aa, []);
    if (!neighbors.has(bb)) neighbors.set(bb, []);
    neighbors.get(aa).push(bb); neighbors.get(bb).push(aa);
    edges.push([a, b]);
  };
  for (const tri of faces) {
    const distances = tri.map(v => v[0] - x);
    if (distances.every(d => Math.abs(d) <= epsilon)) continue;
    const hits = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const a = tri[i], b = tri[j], da = distances[i], db = distances[j];
      if (Math.abs(da) <= epsilon) hits.push([a[1], a[2]]);
      if (da * db < -epsilon * epsilon && Math.abs(da) > epsilon && Math.abs(db) > epsilon) {
        const u = da / (da - db);
        hits.push([mix(a[1], b[1], u), mix(a[2], b[2], u)]);
      }
    }
    if (hits.length === 2) link(hits[0], hits[1]);
  }
  const walked = new Set();
  const loops = [];
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (const [start, list] of neighbors) {
    for (const next of list) {
      if (walked.has(edgeKey(start, next))) continue;
      const contour = [points.get(start)];
      let previous = start, current = next;
      while (current !== start && contour.length <= points.size) {
        contour.push(points.get(current));
        walked.add(edgeKey(previous, current));
        const follow = (neighbors.get(current) || []).find(n => n !== previous && !walked.has(edgeKey(current, n)));
        if (!follow) break;
        previous = current;
        current = follow;
      }
      walked.add(edgeKey(previous, current));
      if (current === start && contour.length >= 3) loops.push(contour);
    }
  }
  return { edges, loops };
}

function scanPlate(size, y, z) {
  const group = new THREE.Group();
  group.position.set(0, y, z);
  const width = size.z + 0.80, height = size.y + 0.70;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: BLUE, opacity: 0.05, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
  );
  panel.renderOrder = 4;
  group.add(panel);
  const ys = height / 2, zs = width / 2, coords = [];
  const line = (y0, z0, y1, z1) => coords.push(0, y0, z0, 0, y1, z1);
  for (const sign of [-1, 1]) {
    line(sign * ys, -zs, sign * ys, zs);
    line(-ys, sign * zs, ys, sign * zs);
    for (let i = 0; i <= 12; i++) {
      const z0 = mix(-zs, zs, i / 12);
      line(sign * ys, z0, sign * (ys + (i % 3 === 0 ? 0.105 : 0.048)), z0);
    }
  }
  for (let i = 1; i < 6; i++) {
    const yy = mix(-ys, ys, i / 6);
    for (let s = 0; s < 18; s += 2) line(yy, mix(-zs, zs, s / 18), yy, mix(-zs, zs, (s + 1) / 18));
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(coords, 3)),
    new THREE.LineBasicMaterial({ color: BLUE, opacity: 0.35, transparent: true, depthWrite: false, toneMapped: false }),
  );
  lines.renderOrder = 5;
  group.add(lines);
  return { group, panel, lines };
}

function sectionMesh(faceSets) {
  const capacity = Math.max(72, faceSets.reduce((n, faces) => n + faces.length * 9, 0));
  const makeGeometry = () => {
    const positions = new THREE.BufferAttribute(new Float32Array(capacity), 3).setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry().setAttribute('position', positions);
    geometry.setDrawRange(0, 0);
    return geometry;
  };
  const cap = new THREE.Mesh(makeGeometry(), new THREE.MeshBasicMaterial({ color: 0x6183eb, opacity: 0.50, transparent: true, side: THREE.DoubleSide, depthWrite: true, toneMapped: false }));
  cap.frustumCulled = false;
  cap.renderOrder = 3;
  const stroke = new THREE.LineSegments(makeGeometry(), new THREE.LineBasicMaterial({ color: 0x092bc1, transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false }));
  stroke.renderOrder = 6;
  stroke.frustumCulled = false;
  let last = Infinity;
  function update(x) {
    if (Math.abs(x - last) < 0.0002) return;
    last = x;
    let si = 0, ci = 0;
    const sl = stroke.geometry.getAttribute('position'), cp = cap.geometry.getAttribute('position');
    for (const faces of faceSets) {
      const { edges, loops } = intersects(faces, x);
      for (const [a, b] of edges) {
        sl.setXYZ(si++, x + 0.002, a[0], a[1]);
        sl.setXYZ(si++, x + 0.002, b[0], b[1]);
      }
      for (const loop of loops) {
        const polygon = loop.map(([y, z]) => new THREE.Vector2(y, z));
        for (const triangle of THREE.ShapeUtils.triangulateShape(polygon, [])) {
          for (const i of triangle) cp.setXYZ(ci++, x + 0.001, polygon[i].x, polygon[i].y);
        }
      }
    }
    cap.geometry.setDrawRange(0, ci); cp.needsUpdate = true;
    stroke.geometry.setDrawRange(0, si); sl.needsUpdate = true;
  }
  return { cap, stroke, update };
}

function sliceMotion(box, size, reduced, isPaused) {
  const middle = (box.min.x + box.max.x) * 0.5;
  const state = { x: middle, yaw: -0.43, pitch: 0.09 };
  let lastT = -1, lastDrag = 0, dragStart = null, dragPosition = middle, heldPosition = null;
  return (t, dt, input) => {
    const reset = lastT < 0 || t < lastT;
    lastT = t;
    if (reset) { dragStart = null; lastDrag = 0; heldPosition = null; }
    const paused = isPaused?.() === true;
    const travel = size.x * 0.46;
    const wave = Math.sin(t * Math.PI * 2 / 12.5 - 0.31);
    let target = reduced ? middle : middle + travel * wave;
    if (input.dragging) {
      const drag = input.dragX || 0;
      if (dragStart === null) { dragStart = lastDrag; dragPosition = state.x; }
      target = clamp(dragPosition + (drag - dragStart) * size.x * 0.82, box.min.x, box.max.x);
      lastDrag = drag;
    } else {
      dragStart = null;
      lastDrag = input.dragX || 0;
      if (paused || reduced) target = heldPosition ?? target;
      else heldPosition = null;
    }
    const speed = reset || reduced || (paused && input.dragging) ? 1 : 1 - Math.exp(-dt * (input.dragging ? 16 : 4.2));
    state.x = mix(state.x, target, speed);
    if (input.dragging) heldPosition = state.x;
    const hover = !reduced && input.active && !input.dragging ? 1 : 0;
    const time = reduced ? 0 : t;
    if (!paused || reset) {
      state.yaw = mix(state.yaw, -0.43 + time * Math.PI * 2 / 104 + (input.x || 0) * 0.045 * hover, speed);
      state.pitch = mix(state.pitch, 0.09 + Math.sin(time * 0.23) * 0.038 + (input.y || 0) * 0.030 * hover, speed);
    }
    return state;
  };
}

function sliceGlassMaterial(clip) {
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fbeec, roughness: 0.075, metalness: 0.05,
    ior: 1.47, clearcoat: 0.72, clearcoatRoughness: 0.07, envMapIntensity: 1.45,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [clip],
  });
  glass.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float grazing = 1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0);
      grazing *= grazing;
      diffuseColor.a *= gl_FrontFacing ? 0.19 + grazing * 0.49 : 0.085 + grazing * 0.12;
      outgoingLight = mix(outgoingLight, vec3(0.36, 0.55, 0.89), grazing * 0.23);
      #include <opaque_fragment>
    `);
  };
  return glass;
}

export async function createSlice({ el, signal, reduced, isPaused }) {
  const mark = await loadMark();
  if (signal?.aborted) { disposeTree(mark); throw new DOMException('Scene cancelled', 'AbortError'); }
  let renderer;
  try { renderer = rendererFor(el); } catch { return createCanvasOptics(el, mark, reduced, 'slice', isPaused); }
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  const camera = cameraFor();
  let cleanupStudio;
  try { cleanupStudio = makeStudio(renderer, scene); }
  catch { releaseRenderer(renderer); return createCanvasOptics(el, mark, reduced, 'slice', isPaused); }
  const { box, size, center } = sceneDimensions(mark);
  const holder = new THREE.Group();
  scene.add(holder);
  const inverseRoot = new THREE.Matrix4().copy(holder.matrixWorld).invert();
  const originals = [];
  mark.traverse(object => { if (object.isMesh) originals.push(object); });
  const faceSets = originals.map(mesh => localFaces(mesh, inverseRoot));
  const glassMark = mark.clone(true);
  const solidClip = new THREE.Plane(), glassClip = new THREE.Plane();
  for (const object of originals) {
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of mats) {
      material.clippingPlanes = [solidClip];
      material.color.setHex(0x718cab);
      material.roughness = 0.31;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  }
  const glassMeshes = [];
  glassMark.traverse(object => { if (object.isMesh) glassMeshes.push(object); });
  const glass = sliceGlassMaterial(glassClip);
  const glassEdge = new THREE.LineBasicMaterial({ color: 0x537cbd, opacity: 0.38, transparent: true, clippingPlanes: [glassClip], depthWrite: false, toneMapped: false });
  for (const object of glassMeshes) {
    object.material = glass;
    object.renderOrder = 1;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 18), glassEdge);
    edge.renderOrder = 2;
    object.add(edge);
  }
  holder.add(mark, glassMark);
  const plate = scanPlate(size, center.y, center.z);
  const section = sectionMesh(faceSets);
  holder.add(plate.group, section.cap, section.stroke);
  const rulerY = box.min.y - 0.42, rulerZ = box.max.z + 0.18;
  const ruleStart = box.min.x - 0.38, ruleEnd = box.max.x + 0.38;
  const ruler = [ruleStart, rulerY, rulerZ, ruleEnd, rulerY, rulerZ];
  for (let i = 0; i <= 36; i++) {
    const x = mix(ruleStart, ruleEnd, i / 36);
    ruler.push(x, rulerY, rulerZ, x, rulerY - (i % 6 === 0 ? 0.115 : 0.046), rulerZ);
  }
  holder.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ruler, 3)),
    new THREE.LineBasicMaterial({ color: 0x687caa, opacity: 0.36, transparent: true, toneMapped: false, depthWrite: false }),
  ));
  const indicator = new THREE.Mesh(
    new THREE.SphereGeometry(0.036, 12, 8),
    new THREE.MeshBasicMaterial({ color: BLUE, toneMapped: false }),
  );
  indicator.position.set(ruleStart, rulerY, rulerZ);
  holder.add(indicator);
  const worldNormal = new THREE.Matrix3();
  const motion = sliceMotion(box, size, reduced, isPaused);

  function frame(t, dt, input) {
    const { x: position, yaw, pitch } = motion(t, dt, input);
    holder.rotation.set(pitch, yaw, -0.015);
    holder.updateMatrixWorld(true);
    worldNormal.getNormalMatrix(holder.matrixWorld);
    solidClip.setComponents(-1, 0, 0, position).applyMatrix4(holder.matrixWorld, worldNormal);
    glassClip.setComponents(1, 0, 0, -position).applyMatrix4(holder.matrixWorld, worldNormal);
    plate.group.position.x = position;
    indicator.position.x = clamp(position, ruleStart, ruleEnd);
    plate.panel.material.opacity = input.dragging ? 0.098 : 0.062;
    plate.lines.material.opacity = input.dragging ? 0.53 : 0.36;
    section.update(position);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    renderer.setPixelRatio(getDpr());
    renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    fitCamera(camera, w, h, size, 1.03);
  }
  resize(el.clientWidth, el.clientHeight);
  function dispose() {
    disposeTree(scene); cleanupStudio?.(); releaseRenderer(renderer);
  }
  return { frame, resize, dispose };
}

const CODE_EXCERPTS = [
  ['light.glsl', [
    '// sample the light field',
    'vec3 ray = normalize(view);',
    'vec3 n = normalize(normal);',
    'float eta = 1.0 / 1.49;',
    'vec3 bend = refract(ray, n, eta);',
    'vec2 uv = origin + bend.xy;',
    'return texture(field, uv);',
  ]],
  ['motion.js', [
    '// ease into the next frame',
    'const frame = (dt) => {',
    '  const k = 1 - exp(-8 * dt);',
    '  x += (target.x - x) * k;',
    '  y += (target.y - y) * k;',
    '  draw(x, y);',
    '};',
  ]],
  ['signal.ts', [
    '// take a point in space',
    'type Point = [number, number];',
    'const ripple = ([x, y]: Point,',
    '  time: number) => {',
    '  const r = Math.hypot(x, y);',
    '  return Math.sin(r * 6 - time);',
    '};',
  ]],
];
const CODE_TOKENS = /\/\/.*|\b(?:vec[23]|float|const|type|return|number)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z]\w*(?=\()/g;
const CODE_FONT = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const codeBackdrops = reduced => CODE_EXCERPTS.slice(0, reduced ? 1 : CODE_EXCERPTS.length).map(() => document.createElement('canvas'));

function codeFrame(t, count) {
  if (count === 1) return [0, 0, 0];
  const phase = Math.max(0, t) / 4.7;
  const cycle = Math.floor(phase), a = cycle % count;
  return [a, (a + 1) % count, ease(0.78, 1, phase - cycle)];
}

function drawCodeBackdrop(canvas, w, h, excerpt) {
  const ratio = Math.min(getDpr(), 1.6, 1650 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(canvas.width / w, canvas.height / h);
  ctx.fillStyle = '#f2f2f1'; ctx.fillRect(0, 0, w, h);
  const tau = Math.PI * 2;
  const r = Math.min(h * 0.408, w * 0.427);
  const x = w * (w > h * 1.2 ? 0.485 : 0.5), y = h * 0.5;
  const ring = r + Math.min(12, r * 0.059);

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#cad5ef';
  ctx.beginPath(); ctx.arc(x, y, ring, 0, tau); ctx.stroke();
  ctx.strokeStyle = '#9eb3e1';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const angle = tau * i / 24, outer = ring + (i % 6 === 0 ? 7 : 2.8);
    ctx.moveTo(x + Math.cos(angle) * ring, y + Math.sin(angle) * ring);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
  }
  ctx.stroke();

  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, tau); ctx.clip();
  const ground = ctx.createLinearGradient(x - r, y + r * .76, x + r, y - r * .82);
  ground.addColorStop(0, '#101a92'); ground.addColorStop(0.44, '#1b3fd2');
  ground.addColorStop(0.78, '#165bea'); ground.addColorStop(1, '#3c9cf4');
  ctx.fillStyle = ground; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const bloom = ctx.createRadialGradient(x + r * .64, y - r * .78, 0, x + r * .64, y - r * .78, r * 1.43);
  bloom.addColorStop(0, '#61d7ff87'); bloom.addColorStop(1, '#61d7ff00');
  ctx.fillStyle = bloom; ctx.fillRect(x - r, y - r, r * 2, r * 2);

  const ruleX = x - r * 0.555, left = x - r * 0.48;
  ctx.strokeStyle = '#d3f4ff36';
  ctx.beginPath(); ctx.moveTo(ruleX, y - r * 0.444); ctx.lineTo(ruleX, y + r * 0.591); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.453); ctx.lineTo(x + r, y - r * 0.453); ctx.stroke();
  const [name, lines] = CODE_EXCERPTS[excerpt];
  ctx.font = `600 ${Math.max(8, r * .063)}px ${CODE_FONT}`;
  ctx.fillStyle = '#e3f6ff'; ctx.fillText(name, x - r * .58, y - r * .56);
  ctx.fillStyle = '#b9e9ff'; ctx.fillText('●', x - r * .666, y - r * .56);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ddf6ff'; ctx.fillText(`0${excerpt + 1} / 03`, x + r * .615, y - r * .56);
  ctx.textAlign = 'left';
  const font = Math.max(7, r * .074);
  ctx.font = `500 ${font}px ${CODE_FONT}`;
  const step = ctx.measureText('0').width;
  for (const [i, line] of lines.entries()) {
    const yy = y + r * (-0.305 + i * .135);
    ctx.fillStyle = '#b5dcff'; ctx.fillText(String(i + 1).padStart(2, '0'), x - r * .727, yy);
    let start = 0;
    for (const token of line.matchAll(CODE_TOKENS)) {
      const value = token[0], index = token.index;
      ctx.fillStyle = '#f7fbff'; ctx.fillText(line.slice(start, index), left + start * step, yy);
      ctx.fillStyle = value.startsWith('//') ? '#bfe7ff' : /^[\d]/.test(value) ? '#c7f9eb' : '#b7f3ff';
      ctx.fillText(value, left + index * step, yy);
      start = index + value.length;
    }
    ctx.fillStyle = '#f7fbff'; ctx.fillText(line.slice(start), left + start * step, yy);
  }
  ctx.restore();
  ctx.strokeStyle = '#9edcff6e';
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r - .5), 0, tau); ctx.stroke();
}

const CODE_SHADER = `
  uniform sampler2D uBackdropA;
  uniform sampler2D uBackdropB;
  uniform float uCodeMix;
  vec4 sampleField(vec2 uv) {
    vec4 current = texture2D(uBackdropA, uv);
    if (uCodeMix <= 0.) return current;
    return mix(current, texture2D(uBackdropB, uv), uCodeMix);
  }
`;

export async function createLens(ctx) { return createLensVariant(ctx, false); }
export async function createLightLens(ctx) { return createLensVariant(ctx, true); }

async function createLensVariant({ el, signal, reduced }, lightField) {
  const mark = await loadMark();
  if (signal?.aborted) { disposeTree(mark); throw new DOMException('Scene cancelled', 'AbortError'); }
  let renderer;
  try { renderer = rendererFor(el); } catch {
    return createCanvasOptics(el, mark, reduced, lightField ? 'lightLens' : 'lens');
  }
  const scene = new THREE.Scene(), camera = cameraFor();
  const { size } = sceneDimensions(mark);
  const field = lightField ? createLightField(CODE_EXCERPTS, reduced) : null;
  const canvases = field ? field.atlases : codeBackdrops(reduced);
  const textureFor = (canvas, color = true) => {
    const texture = new THREE.CanvasTexture(canvas);
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  };
  const textures = canvases.map(canvas => textureFor(canvas, !field));
  const paperTexture = field ? textureFor(field.backdrop) : null;
  const codeUniforms = field ? {
    uPaper: { value: paperTexture }, uGlyphA: { value: textures[0] }, uGlyphB: { value: textures[1] || textures[0] },
    uCodeRect: { value: new THREE.Vector4() }, uCircle: { value: new THREE.Vector4() },
    uGrid: { value: new THREE.Vector2(field.columns, field.rows) },
    uCell: { value: new THREE.Vector2(canvases[0].width / field.columns, canvases[0].height / field.rows) },
    uScan: { value: new THREE.Vector3() },
  } : {
    uBackdropA: { value: textures[0] }, uBackdropB: { value: textures[1] || textures[0] }, uCodeMix: { value: 0 },
  };
  const codeShader = field ? LIGHT_FIELD_SHADER : CODE_SHADER;
  const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: codeUniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,.999,1.);}',
    fragmentShader: `${codeShader} varying vec2 vUv; void main(){gl_FragColor=sampleField(vUv);\n#include <colorspace_fragment>\n}`,
  }));
  background.frustumCulled = false;
  background.renderOrder = -100;
  scene.add(background);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...codeUniforms, uResolution: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTime: { value: 0 },
    },
    side: THREE.FrontSide,
    toneMapped: false,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        vNormal=normalize(normalMatrix*normal);
        vView=-mv.xyz;
        gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader: `
      ${codeShader}
      uniform vec2 uResolution;
      uniform vec2 uCenter;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      void main(){
        vec2 uv = gl_FragCoord.xy/uResolution;
        vec3 n = normalize(vNormal), v = normalize(vView);
        float facing = clamp(dot(n,v),0.,1.);
        float fresnel = pow(1.-facing,2.8);
        float aspect = uResolution.x/uResolution.y;
        vec2 bend = vec2(n.x / aspect,n.y) * (.026 + fresnel * .025);
        vec2 lens = uCenter + (uv-uCenter) * (0.81 + (1.-facing) * 0.075) - bend;
        vec2 split = ${field ? '(uv-uCenter) * .0036 + bend * .028' : '(uv-uCenter) * .006 + bend * .04'};
        vec3 refracted = vec3(
          sampleField(clamp(lens + split,0.,1.)).r,
          sampleField(clamp(lens,0.,1.)).g,
          sampleField(clamp(lens - split,0.,1.)).b
        );
        // A restrained cool tint makes the clear material legible over pale gray.
        vec3 pale = vec3(.72,.84,1.);
        vec3 cool = vec3(.13,.31,.73);
        float ribbon = sin((uv.x + uv.y * .48) * 21. + n.x * 3.4 - min(uTime,2.2) * .78);
        float softbox = pow(max(0., ribbon),8.) * (.06 + fresnel * .18);
        float reflection = pow(max(0.,dot(reflect(-v,n),normalize(vec3(-.58,.72,1.)))),16.);
        vec3 color = mix(refracted,pale,${field ? '.028 + softbox * .56' : '.095 + softbox'});
        color = mix(color,cool,${field ? 'fresnel * .34 + abs(n.x) * .074' : 'fresnel * .28 + abs(n.x) * .06'});
        color += vec3(.48,.65,.88) * reflection * .28;
        gl_FragColor = vec4(color,1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: field ? 0x44689e : 0x517dd2, opacity: field ? 0.43 : 0.27, transparent: true, depthWrite: false, toneMapped: false });
  const replaced = new Set(), meshes = [];
  mark.traverse(object => { if (object.isMesh) meshes.push(object); });
  for (const object of meshes) {
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(old => replaced.add(old));
    object.material = material;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 19), edgeMaterial);
    edge.renderOrder = 2;
    object.add(edge);
  }
  replaced.forEach(old => old.dispose());
  const holder = new THREE.Group();
  holder.add(mark); scene.add(holder);
  const projected = new THREE.Vector3();
  let offsetX = -1.95, offsetY = 0.42, angle = -0.63, pitch = -0.10, lastT = -1;

  function frame(t, dt, input) {
    const intro = reduced ? 1 : ease(0.02, 1.95, t);
    const drag = reduced ? 0 : clamp(input.dragX || 0, -1, 1);
    const dragY = reduced ? 0 : clamp(input.dragY || 0, -1, 1);
    const move = !reduced && input.active ? (input.x || 0) : 0;
    const moveY = !reduced && input.active ? (input.y || 0) : 0;
    const mobileScale = camera.aspect < 1 ? 0.46 : 1;
    const damping = reduced || t < lastT || lastT < 0 || dt === 0 ? 1 : 1 - Math.exp(-dt * 8);
    lastT = t;
    offsetX = mix(offsetX, (mix(-1.95, 0.34, intro) + (move * 0.72 + drag * 0.55) * intro) * mobileScale, damping);
    offsetY = mix(offsetY, mix(0.42, 0.04, intro) - (moveY * 0.34 + dragY * 0.22) * intro, damping);
    angle = mix(angle, mix(-0.63, -0.26, intro) + (move * 0.13 + drag * 0.08) * intro, damping);
    pitch = mix(pitch, mix(-0.10, 0.09, intro) + moveY * 0.10 * intro, damping);
    holder.position.set(offsetX, offsetY, 0);
    holder.rotation.set(pitch, angle, 0.035);
    projected.copy(holder.position).project(camera);
    material.uniforms.uCenter.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    material.uniforms.uTime.value = reduced ? 2.2 : t;
    if (field) {
      const { from, to, roll, burst, jump } = field.timing(t);
      codeUniforms.uGlyphA.value = textures[from];
      codeUniforms.uGlyphB.value = textures[to];
      codeUniforms.uScan.value.set(roll, burst, jump);
    } else {
      const [a, b, blend] = codeFrame(t, textures.length);
      codeUniforms.uBackdropA.value = textures[a];
      codeUniforms.uBackdropB.value = textures[b];
      codeUniforms.uCodeMix.value = blend;
    }
    renderer.render(scene, camera);
  }
  function resize(w, h) {
    w = Math.max(1, w); h = Math.max(1, h);
    renderer.setPixelRatio(getDpr()); renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(material.uniforms.uResolution.value);
    fitCamera(camera, w, h, size, 1.17);
    if (field) {
      const { x, y, width, height, cx, cy, r } = field.resize(w, h, getDpr());
      codeUniforms.uCodeRect.value.set(x / w, y / h, width / w, height / h);
      codeUniforms.uCircle.value.set(cx / w, cy / h, w / r, h / r);
      paperTexture.needsUpdate = true;
    } else {
      canvases.forEach((canvas, i) => {
        drawCodeBackdrop(canvas, w, h, i);
        textures[i].needsUpdate = true;
      });
    }
  }
  resize(el.clientWidth, el.clientHeight);
  function dispose() {
    textures.forEach(texture => texture.dispose());
    paperTexture?.dispose();
    disposeTree(scene); releaseRenderer(renderer);
  }
  return { frame, resize, dispose };
}

function clipAtX(vertices, x, side) {
  const result = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const ad = (a[0] - x) * side, bd = (b[0] - x) * side;
    if (ad >= 0) result.push(a);
    if ((ad < 0 && bd > 0) || (ad > 0 && bd < 0)) {
      const u = ad / (ad - bd);
      result.push([x, mix(a[1], b[1], u), mix(a[2], b[2], u)]);
    }
  }
  return result;
}

function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    a += p[0] * q[1] - p[1] * q[0];
  }
  return a * 0.5;
}

// The software renderer uses the same vertices and section solver. No simplified
// logo substitute is needed on devices where WebGL is disabled or unavailable.
function createCanvasOptics(el, mark, reduced, kind, isPaused) {
  const { box, size, center } = sceneDimensions(mark);
  const faceSets = [], meshEdges = [];
  const identity = new THREE.Matrix4(), point = new THREE.Vector3();
  mark.traverse(mesh => {
    if (!mesh.isMesh) return;
    faceSets.push(localFaces(mesh, identity));
    const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 18);
    const positions = edgeGeometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 2) {
      const a = point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).toArray();
      const b = point.fromBufferAttribute(positions, i + 1).applyMatrix4(mesh.matrixWorld).toArray();
      meshEdges.push([a, b]);
    }
    edgeGeometry.dispose();
  });
  disposeTree(mark);
  const faces = faceSets.flat().map(vertices => {
    const [a, b, c] = vertices.map(p => new THREE.Vector3().fromArray(p));
    return { vertices, normal: b.sub(a).cross(c.sub(a)).normalize() };
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas unavailable');
  canvas.style.cssText = CSS_CANVAS;
  canvas.setAttribute('aria-hidden', 'true');
  el.append(canvas);
  const backdrops = kind === 'lens' ? codeBackdrops(reduced) : [];
  const blendCanvas = backdrops.length > 1 ? document.createElement('canvas') : null;
  const lightField = kind === 'lightLens' ? createLightFieldCanvas(CODE_EXCERPTS, reduced, getDpr) : null;
  const lensMode = kind !== 'slice';
  const camera = cameraFor(), object = new THREE.Object3D();
  const viewProjection = new THREE.Matrix4(), clip = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3(), tempNormal = new THREE.Vector3();
  const light = new THREE.Vector3(-0.55, 0.72, 1.0).normalize();
  let w = 1, h = 1, dpr = 1, lastT = -1;
  const scanMotion = kind === 'slice' ? sliceMotion(box, size, reduced, isPaused) : null;
  let scan = 0;
  let yaw = lensMode ? -0.63 : -0.48, pitch = 0.11;
  let offsetX = 0, offsetY = 0;

  function resize(width, height) {
    w = Math.max(1, width); h = Math.max(1, height); dpr = getDpr();
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    fitCamera(camera, w, h, size, lensMode ? 1.17 : 1.03);
    camera.updateMatrixWorld(true);
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    backdrops.forEach((canvas, i) => drawCodeBackdrop(canvas, w, h, i));
    lightField?.resize(w, h);
    if (blendCanvas) {
      blendCanvas.width = backdrops[0].width;
      blendCanvas.height = backdrops[0].height;
    }
  }

  function project(p) {
    point.fromArray(p).applyMatrix4(clip);
    return [(point.x * 0.5 + 0.5) * w, (0.5 - point.y * 0.5) * h, point.z];
  }
  function path(points, close = true) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (close) ctx.closePath();
  }
  function line(a, b) { path([project(a), project(b)], false); ctx.stroke(); }
  function currentBackdrop(t) {
    if (lightField) return lightField.frame(t);
    if (!backdrops.length) return null;
    const [a, b, blend] = codeFrame(t, backdrops.length);
    if (blend === 0) return backdrops[a];
    const blendContext = blendCanvas.getContext('2d', { alpha: false });
    blendContext.drawImage(backdrops[a], 0, 0);
    blendContext.globalAlpha = blend;
    blendContext.drawImage(backdrops[b], 0, 0);
    blendContext.globalAlpha = 1;
    return blendCanvas;
  }
  function frame(t, dt, input) {
    const x = input.x || 0, y = input.y || 0;
    const active = input.active || input.dragging;
    const reset = t < lastT || lastT < 0;
    const damping = reduced || reset || dt === 0 ? 1 : 1 - Math.exp(-dt * (active ? 11 : 8));
    lastT = t;
    if (kind === 'slice') {
      const slice = scanMotion(t, dt, input);
      scan = slice.x;
      object.position.set(0, 0, 0); object.rotation.set(slice.pitch, slice.yaw, -0.015);
    } else {
      const intro = reduced ? 1 : ease(0.02, 1.95, t);
      const dragX = reduced ? 0 : clamp(input.dragX || 0, -1, 1);
      const dragY = reduced ? 0 : clamp(input.dragY || 0, -1, 1);
      const mx = !reduced && input.active ? x : 0, my = !reduced && input.active ? y : 0;
      offsetX = mix(offsetX, (mix(-1.95, 0.34, intro) + (mx * 0.72 + dragX * 0.55) * intro) * (w < h ? 0.46 : 1), damping);
      offsetY = mix(offsetY, mix(0.42, 0.04, intro) - (my * 0.34 + dragY * 0.22) * intro, damping);
      yaw = mix(yaw, mix(-0.63, -0.26, intro) + (mx * 0.13 + dragX * 0.08) * intro, damping);
      pitch = mix(pitch, mix(-0.10, 0.09, intro) + my * 0.10 * intro, damping);
      object.position.set(offsetX, offsetY, 0); object.rotation.set(pitch, yaw, 0.035);
    }
    object.updateMatrix(); clip.multiplyMatrices(viewProjection, object.matrix);
    normalMatrix.getNormalMatrix(object.matrix);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const background = currentBackdrop(t);
    if (background) ctx.drawImage(background, 0, 0, w, h);
    const centerScreen = project([center.x, center.y, center.z]);
    const shapes = [];
    function push(vertices, normal, role, cull = true) {
      if (vertices.length < 3) return;
      const points = vertices.map(project);
      const area = polygonArea(points);
      if (Math.abs(area) < 0.02 || (cull && area > 0)) return;
      shapes.push({ points, normal, role, front: area < 0, z: points.reduce((sum, p) => sum + p[2], 0) / points.length });
    }
    for (const { vertices, normal } of faces) {
      if (lensMode) push(vertices, normal, 'lens');
      else {
        push(clipAtX(vertices, scan, -1), normal, 'steel');
        push(clipAtX(vertices, scan, 1), normal, 'glass', false);
      }
    }
    const left = box.min.x - 0.38, right = box.max.x + 0.38;
    const rulerY = box.min.y - 0.42, rulerZ = box.max.z + 0.18;
    if (kind === 'slice') {
      for (const set of faceSets) {
        const { loops } = intersects(set, scan);
        for (const loop of loops) push(loop.map(([yy, zz]) => [scan + 0.001, yy, zz]), null, 'cut', false);
      }
      for (const [a, b] of meshEdges) {
        if (a[0] < scan && b[0] < scan) continue;
        let edge = [a, b];
        if (a[0] < scan || b[0] < scan) {
          const u = (scan - a[0]) / (b[0] - a[0]);
          const cross = [scan, mix(a[1], b[1], u), mix(a[2], b[2], u)];
          edge = a[0] >= scan ? [a, cross] : [cross, b];
        }
        const points = edge.map(project);
        shapes.push({ points, role: 'glassEdge', z: (points[0][2] + points[1][2]) / 2 - 0.00002 });
      }
      const y0 = box.min.y - 0.35, y1 = box.max.y + 0.35;
      const z0 = box.min.z - 0.40, z1 = box.max.z + 0.40;
      push([[scan,y0,z0],[scan,y1,z0],[scan,y1,z1],[scan,y0,z1]], null, 'plate', false);
      ctx.strokeStyle = '#687caa66';
      line([left,rulerY,rulerZ], [right,rulerY,rulerZ]);
      for (let i = 0; i <= 36; i++) {
        const xx = mix(left,right,i/36);
        line([xx,rulerY,rulerZ],[xx,rulerY-(i%6===0 ? 0.115 : 0.046),rulerZ]);
      }
    }
    shapes.sort((a, b) => b.z - a.z);
    for (const shape of shapes) {
      const { points, normal, role, front } = shape;
      if (role === 'glassEdge') {
        path(points, false); ctx.strokeStyle = '#4b70b77a'; ctx.stroke();
        continue;
      }
      path(points);
      if (role === 'lens') {
        const n = tempNormal.copy(normal).applyMatrix3(normalMatrix).normalize();
        const mag = 1.20 + Math.abs(n.x) * 0.035;
        const ox = centerScreen[0] * (1 - mag) + n.x * h * 0.045;
        const oy = centerScreen[1] * (1 - mag) - n.y * h * 0.045;
        const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
        const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
        const pw = maxX - minX, ph = maxY - minY;
        const ratioX = background.width / w / mag, ratioY = background.height / h / mag;
        ctx.save(); ctx.clip();
        if (pw > 0 && ph > 0) ctx.drawImage(background, (minX - ox) * ratioX, (minY - oy) * ratioY, pw * ratioX, ph * ratioY, minX, minY, pw, ph);
        ctx.fillStyle = `rgba(153,190,255,${(lightField ? 0.065 : 0.12) + (1 - Math.abs(n.z)) * (lightField ? 0.23 : 0.15)})`;
        ctx.fillRect(minX, minY, pw, ph);
        const reflection = ctx.createLinearGradient(minX, minY, maxX + 1, maxY + 1);
        reflection.addColorStop(0, `rgba(250,253,255,${0.22 + Math.max(0,n.dot(light)) * 0.25})`);
        reflection.addColorStop(0.33, 'rgba(236,248,255,0.04)');
        reflection.addColorStop(0.82, 'rgba(255,255,255,0.02)');
        reflection.addColorStop(1, 'rgba(226,242,255,0.28)');
        ctx.fillStyle = reflection; ctx.fillRect(minX, minY, pw, ph);
        ctx.restore();
      } else if (role === 'steel') {
        const n = tempNormal.copy(normal).applyMatrix3(normalMatrix).normalize();
        const shade = 0.41 + Math.max(0, n.dot(light)) * 0.40;
        const silver = c => `rgb(${Math.round(218 * c)},${Math.round(235 * c)},${Math.round(255 * c)})`;
        const gloss = ctx.createLinearGradient(0,h*.1,w*.78,h*.83);
        gloss.addColorStop(0,silver(shade*.86)); gloss.addColorStop(.36,silver(Math.min(1,shade*1.16)));
        gloss.addColorStop(.62,silver(shade*.72)); gloss.addColorStop(1,silver(Math.min(1,shade*.99)));
        ctx.fillStyle = gloss; ctx.fill();
      } else if (role === 'glass') {
        const n = tempNormal.copy(normal).applyMatrix3(normalMatrix).normalize();
        const grazing = (1 - Math.abs(n.z)) ** 2;
        const amount = front ? 0.13 + grazing * 0.26 : 0.058 + grazing * 0.08;
        const glass = ctx.createLinearGradient(w * 0.24, h * 0.14, w * 0.68, h * 0.86);
        glass.addColorStop(0, `rgba(104,155,231,${amount * 1.65})`);
        glass.addColorStop(0.41, `rgba(231,245,255,${amount * 1.7})`);
        glass.addColorStop(0.51, `rgba(246,253,255,${amount * 2.2})`);
        glass.addColorStop(0.56, `rgba(139,181,241,${amount})`);
        glass.addColorStop(1, `rgba(81,129,211,${amount * 1.52})`);
        ctx.fillStyle = glass; ctx.fill();
      } else if (role === 'cut') {
        ctx.fillStyle = '#6183eb80'; ctx.fill(); ctx.strokeStyle = '#163ecfdb'; ctx.stroke();
      } else {
        ctx.fillStyle = input.dragging ? '#1748e619' : '#1748e610'; ctx.fill();
        ctx.strokeStyle = input.dragging ? '#1748e687' : '#1748e65c'; ctx.stroke();
      }
    }
    if (lensMode) {
      ctx.strokeStyle = lightField ? '#4068a65f' : '#4f79bd40';
      for (const [a, b] of meshEdges) line(a, b);
    }
    if (kind === 'slice') {
      const marker = project([clamp(scan,left,right),rulerY,rulerZ]);
      ctx.fillStyle = '#1748e6'; ctx.beginPath(); ctx.arc(marker[0],marker[1],2.1,0,Math.PI*2); ctx.fill();
    }
  }
  resize(el.clientWidth, el.clientHeight);
  return { frame, resize, dispose: () => canvas.remove() };
}
