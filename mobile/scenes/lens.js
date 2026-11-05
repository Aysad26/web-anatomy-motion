import * as THREE from 'three';
import { loadMark } from '../../mark-kit.js';
import { adaptiveRingSpacing } from './ring-density.js';

const WORD = 'ФОКУС';
const PAPER = '#f3f5f7';
const NIGHT = '#0b101c';
const RING_SPACING_PX = 6.7;
const RING_RADIAL_SPEED = .0099;
const RING_PHASE = .27;
const RING_WIDTH = .65;
const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV * 0.5));
const CANVAS_STYLE = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const smooth = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const pixelRatio = (w = 1, h = 1) => Math.min(globalThis.devicePixelRatio || 1, 1.75, 1800 / w, 1300 / h, Math.sqrt(1800000 / (w * h)));

function attach(canvas, el) {
  canvas.style.cssText = CANVAS_STYLE;
  canvas.setAttribute('aria-hidden', 'true');
  el.append(canvas);
}

function disposeTree(root) {
  const materials = new Set();
  root.traverse(item => {
    item.geometry?.dispose();
    if (item.material) materials.add(item.material);
  });
  materials.forEach(item => item.dispose());
}

function drawWord(canvas, w, h) {
  const scale = Math.min(pixelRatio(), 1.65, 1150 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Optical type needs Canvas 2D');
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  ctx.font = '850 120px "WA Flex Wide", "Arial Black", Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(WORD);
  const left = metrics.actualBoundingBoxLeft || 0;
  const right = metrics.actualBoundingBoxRight || metrics.width;
  const ascent = metrics.actualBoundingBoxAscent || 87;
  const descent = metrics.actualBoundingBoxDescent || 2;
  const width = Math.min(w * .93, h * 1.78);
  const capHeight = Math.min(h * .205, width * .233);
  ctx.translate(w * .5, h * .536);
  ctx.scale(width / (left + right), capHeight / (ascent + descent));
  ctx.fillStyle = '#000000';
  ctx.fillText(WORD, (left - right) * .5, (ascent - descent) * .5);
}

// A separate background for the fourth concept: gently expanding circles,
// with no glyph texture and no link to the lens position. The moving glass
// therefore visibly displaces the same rings through its actual cut surfaces.
function drawRings(canvas, w, h, t, dark, spacingPx) {
  const scale = Math.min(pixelRatio(), 1.65, 1150 / Math.max(w, h));
  const ww = Math.max(1, Math.round(w * scale)), hh = Math.max(1, Math.round(h * scale));
  if (canvas.width !== ww || canvas.height !== hh) { canvas.width = ww; canvas.height = hh; }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Optical circles need Canvas 2D');
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,ww,hh);
  ctx.setTransform(ww/w,0,0,hh/h,0,0);
  ctx.lineWidth = RING_WIDTH;
  const spacing = spacingPx / h;
  const phase = ((t * RING_RADIAL_SPEED / spacing + RING_PHASE) % 1 + 1) % 1;
  for(let i=0;i<Math.ceil(.84/spacing)+1;i++) {
    const radius=(i+phase)*spacingPx;
    const fade=smooth(.012,.07,radius/h)*(1-smooth(.71,.84,radius/h));
    ctx.strokeStyle = dark ? `rgba(83,143,220,${.64*fade})` : `rgba(97,151,215,${.47*fade})`;
    ctx.beginPath(); ctx.arc(w*.5,h*.5,radius,0,Math.PI*2); ctx.stroke();
  }
}

function fit(camera, w, h, size) {
  const aspect = w / h;
  camera.aspect = aspect;
  const z = Math.max(size.x / (2 * TAN * aspect * .758), size.y / (2 * TAN * .66)) + size.z * .37;
  camera.position.set(0, .075, z);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function makeMotion(reduced, rings = false) {
  let lastT = -1;
  const state = { x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, word: 1, shift: 0, pressure: 0, scale: 1 };
  // The ring lens rests in three-quarter view so its cut sides remain visible
  // after the entrance. Keep the same pose in the GPU and Canvas paths.
  const restYaw = rings ? -.54 : -.24;
  const restPitch = rings ? .22 : .105;
  let pressureVelocity = 0;
  return (t, dt, input = {}, viewW, viewH) => {
    const reset = lastT < 0 || t < lastT;
    lastT = t;
    const intro = reduced ? 1 : smooth(.015, 1.78, t);
    const live = reduced ? 0 : smooth(1.68, 2.65, t);
    const touching = !reduced && input.dragging;
    // An underdamped focus spring gives a held lens weight, then a soft release.
    if (reset || reduced) { state.pressure = 0; pressureVelocity = 0; }
    const step = Math.min(Math.max(dt || 0, 0), .05);
    pressureVelocity += ((touching ? 1 : 0) - state.pressure) * 100 * step;
    pressureVelocity *= Math.exp(-12 * step);
    state.pressure = clamp(state.pressure + pressureVelocity * step, 0, 1.08);
    const px = !reduced && input.active && !input.pressed ? clamp(input.x || 0, -1, 1) : 0;
    const py = !reduced && input.active && !input.pressed ? clamp(input.y || 0, -1, 1) : 0;
    const dx = touching ? clamp(input.dragX || 0, -1.25, 1.25) : 0;
    const dy = touching ? clamp(input.dragY || 0, -1.1, 1.1) : 0;
    const follow = reset || reduced ? 1 : 1 - Math.exp(-Math.max(0, dt) * (touching ? 16 : 7.8));
    const drift = live * Math.sin(t * .38);
    const bob = live * Math.sin(t * .47 + .55);
    state.x = mix(state.x, viewW * clamp(mix(-.124, .032, intro) + (px * .071 + dx * .18) * intro + drift * .026, -.13, .13), follow);
    state.y = mix(state.y, viewH * clamp(mix(-.049, .052, intro) - (py * .045 + dy * .13) * intro + bob * .006, -.105, .14), follow);
    state.yaw = mix(state.yaw, mix(-.71, restYaw, intro) + (px * .125 + dx * .135) * intro + drift * .026, follow);
    state.pitch = mix(state.pitch, mix(.25, restPitch, intro) + (py * .107 + dy * .11) * intro + bob * .019, follow);
    state.roll = mix(state.roll, mix(-.13, -.06, intro) - dx * .055 * intro, follow);
    state.word = reduced ? 1 : mix(.16, 1, smooth(.12, 1.23, t));
    state.shift = reduced ? 0 : .033 * (1 - smooth(.085, 1.19, t));
    state.scale = mix(.87, 1, intro) + state.pressure * .036;
    return state;
  };
}

const FIELD = `
  uniform sampler2D uType;
  uniform vec2 uLensCenter;
  uniform vec2 uTypeMotion;
  uniform float uDark;
  uniform float uFocus;
  uniform float uTime;

  vec3 fieldAt(vec2 uv) {
    vec3 paper = mix(vec3(.89627, .91310, .93011), vec3(.00335,.00518,.01161), uDark);
    vec2 shadeUV = (uv - uLensCenter + vec2(-.019, .207)) / vec2(.283, .073);
    float contact = exp(-dot(shadeUV, shadeUV) * 2.1) * .08;
    paper = mix(paper, mix(vec3(.33,.45,.64),vec3(.015,.041,.10),uDark),contact);
    // A quiet, elliptic caustic anchors the lens without drawing a visible pedestal.
    vec2 pool = (uv - uLensCenter + vec2(.012,.205)) / vec2(.29,.076);
    float rr = length(pool);
    float caustic = exp(-pow((rr - .68 - .07*uFocus)*7.5,2.)) * exp(-rr*.68);
    float arc = smoothstep(-.75,.5,pool.x) * smoothstep(-.3,.65,pool.y);
    paper += vec3(.006,.028,.085) * caustic * arc * (.32 + .9*uDark + .4*uFocus);
    // The pigment-free field gains only a subtle blue radial reflection.
    vec2 haloUV=(uv-uLensCenter)/vec2(.43,.35);
    float halo=exp(-dot(haloUV,haloUV)*3.2);
    paper += vec3(.002,.008,.024)*halo*uDark;
    float word = texture2D(uType, clamp(uv + vec2(0., uTypeMotion.y), 0., 1.)).a * uTypeMotion.x;
    vec3 ink = mix(vec3(.00518,.00605,.00913),vec3(.82,.87,.95),uDark);
    return mix(paper,ink,word);
  }
`;

const RING_FIELD = `
  uniform vec2 uLensCenter;
  uniform vec2 uTypeMotion;
  uniform vec2 uFieldSize;
  uniform float uRingSpacing;
  uniform float uDark;
  uniform float uFocus;
  uniform float uTime;

  vec3 fieldAt(vec2 uv) {
    vec3 paper=mix(vec3(.89627,.91310,.93011),vec3(.00335,.00518,.01161),uDark);
    vec2 d=(uv-vec2(.5))*vec2(uFieldSize.x/uFieldSize.y,1.);
    float radius=length(d);
    float pixel=1./max(1.,uFieldSize.y);
    float spacing=uRingSpacing*pixel;
    float phase=fract(uTime*${RING_RADIAL_SPEED}/spacing+${RING_PHASE});
    float ringDistance=abs(fract(radius/spacing-phase+.5)-.5)*spacing;
    float halfWidth=${RING_WIDTH * .5}*pixel;
    // Average the stroke over the current radial pixel footprint, including
    // where the lens stretches the ring field on its cut planes.
    float feather=min(spacing*.48,max(pixel*.24,fwidth(radius)*.5));
    float ring=clamp((min(ringDistance+feather,halfWidth)-max(ringDistance-feather,-halfWidth))/(2.*feather),0.,1.);
    float fade=smoothstep(.012,.07,radius)*(1.-smoothstep(.71,.84,radius));
    vec3 blue=mix(vec3(.12,.31,.62),vec3(.087,.275,.65),uDark);
    // Fixed, calm pigment: optical amplification comes from the glass itself.
    return mix(paper,blue,ring*fade*mix(.36,.48,uDark)*uTypeMotion.x);
  }
`;

const GLASS_VERTEX = `
  varying vec3 vViewPoint;
  varying vec3 vSurfaceNormal;
  void main() {
    vec4 point = modelViewMatrix * vec4(position, 1.);
    vViewPoint = point.xyz;
    vSurfaceNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * point;
  }
`;

const GLASS_FRAGMENT = `
  ${FIELD}
  uniform vec2 uBuffer;
  uniform mat4 uProjection;
  uniform float uPlaneDepth;
  varying vec3 vViewPoint;
  varying vec3 vSurfaceNormal;

  void main() {
    vec2 uv = gl_FragCoord.xy / uBuffer;
    vec3 incident = normalize(vViewPoint);
    vec3 n = normalize(vSurfaceNormal);
    float facing = clamp(dot(n, -incident), 0., 1.);
    float grazing = pow(1. - facing, 1.72);
    // Project where the bent viewing ray reaches the plane behind the volume.
    vec3 bentRay = refract(incident, n, 1. / 1.49);
    float travel = clamp(uPlaneDepth + vViewPoint.z, .31, 2.45);
    vec3 hit = vViewPoint + bentRay * (travel / max(.27, -bentRay.z));
    vec4 projected = uProjection * vec4(hit, 1.);
    vec2 bend = clamp(projected.xy / projected.w * .5 + .5 - uv, vec2(-.104), vec2(.104));
    float magnification = .125 + facing * (.10 + .065*uFocus);
    vec2 sampleUV = uv + bend * (1. + .16*uFocus) + (uLensCenter - uv) * magnification;
    vec2 fringe = clamp(bend * (.038 + grazing * .025), vec2(-.0027), vec2(.0027));
    // Dispersion is deliberately monochrome/cyan: no red reflection at black edges.
    vec3 through = fieldAt(sampleUV);
    float dispersion = length(fieldAt(sampleUV+fringe)-fieldAt(sampleUV-fringe));
    through = mix(through, vec3(.075,.36,.84), clamp(dispersion*.19,0.,.24));
    vec3 reflected = reflect(incident, n);
    vec2 softbox = (reflected.xy - vec2(-.35, .49)) / vec2(.68, .22);
    float mainPanel = exp(-pow(abs(softbox.x), 4.) - pow(abs(softbox.y), 4.));
    float rimDistance = (reflected.x - .53) / .145;
    float rimPanel = exp(-rimDistance * rimDistance) * smoothstep(-.68, .16, reflected.y);
    float ribbon = exp(-pow((reflected.x + reflected.y*.34 + .27 + .04*sin(uTime*.36))/.065,2.));
    float pearl = .025 + .027 * max(n.y, 0.) + .035 * mainPanel + .032*uDark;
    // Cut planes separate by their normal-dependent transmission and reflections.
    // No geometric contours or outline masks are added to the glass.
    vec3 color = mix(through, mix(vec3(.48,.69,.99),vec3(.15,.36,.67),uDark), pearl);
    color = mix(color, mix(vec3(.045,.145,.41),vec3(.055,.20,.43),uDark), grazing * (.45+.12*uDark) + abs(n.x) * .12 + max(-n.y,0.)*.055);
    color += vec3(.30,.48,.76) * (rimPanel * (.16 + grazing * .19) + mainPanel * (.12 + grazing * .15));
    color += vec3(.18,.36,.59) * ribbon * (.055 + .13*grazing + .035*uFocus);
    // A long softbox travels slowly across the three cut volumes.
    float stripX=uv.x-uLensCenter.x+(uv.y-uLensCenter.y)*.46-.14*sin(uTime*.28+.7);
    float strip=exp(-pow(stripX/.028,2.));
    color += vec3(.26,.40,.57)*strip*(.08+.16*grazing+.08*uDark);
    gl_FragColor = vec4(color, 1.);
    #include <colorspace_fragment>
  }
`;

function makeRenderer(canvas) {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'low-power' });
  if (!context) throw new Error('WebGL2 unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: false, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function gpuLens(el, mark, reduced, renderer, dark, rings = false) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 60);
  const size = new THREE.Box3().setFromObject(mark).getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  const word = document.createElement('canvas');
  const texture = new THREE.CanvasTexture(word);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const field = {
    uType: { value: texture },
    uLensCenter: { value: new THREE.Vector2(.5, .55) },
    uTypeMotion: { value: new THREE.Vector2(1, 0) },
    uDark: { value: dark ? 1 : 0 }, uFocus: { value: 0 }, uTime: { value: 0 },
    uFieldSize: {value: new THREE.Vector2(1,1)},
    ...(rings ? {uRingSpacing: {value: RING_SPACING_PX}} : {}),
  };
  const fieldShader = rings ? RING_FIELD : FIELD;
  const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: field, toneMapped: false, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,.999,1.);}',
    fragmentShader: `${fieldShader} varying vec2 vUv; void main(){gl_FragColor=vec4(fieldAt(vUv),1.);\n#include <colorspace_fragment>\n}`,
  }));
  background.frustumCulled = false; background.renderOrder = -10;
  const glass = new THREE.ShaderMaterial({
    uniforms: { ...field, uBuffer: { value: new THREE.Vector2(1, 1) }, uProjection: { value: camera.projectionMatrix }, uPlaneDepth: { value: 10 } },
    vertexShader: GLASS_VERTEX, fragmentShader: rings ? GLASS_FRAGMENT.replace(FIELD,RING_FIELD) : GLASS_FRAGMENT, toneMapped: false,
  });
  for (const mesh of mark.children) {
    mesh.material.dispose();
    mesh.material = glass;
  }
  holder.add(mark);
  scene.add(background, holder);
  const motion = makeMotion(reduced, rings), projected = new THREE.Vector3();
  let w = 0, h = 0, dpr = 0;
  function resize(width, height) {
    const ww = Math.max(1, width), hh = Math.max(1, height), dd = pixelRatio(ww, hh);
    if (ww === w && hh === h && dd === dpr) return;
    w = ww; h = hh; dpr = dd;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(glass.uniforms.uBuffer.value);
    fit(camera, w, h, size);
    glass.uniforms.uPlaneDepth.value = camera.position.z + size.z * .48 + .35;
    field.uFieldSize.value.set(w,h);
    if (rings) {
      field.uRingSpacing.value = adaptiveRingSpacing(w,h,RING_SPACING_PX);
      word.width=word.height=1;
    }
    else drawWord(word, w, h);
    texture.needsUpdate = true;
  }
  function frame(t, dt, input) {
    const viewH = camera.position.z * 2 * TAN;
    const state = motion(t, dt, input, viewH * camera.aspect, viewH);
    holder.position.set(state.x, state.y, 0);
    holder.rotation.set(state.pitch, state.yaw, state.roll);
    holder.scale.setScalar(state.scale);
    field.uFocus.value = state.pressure;
    field.uTime.value = reduced ? 0 : t;
    projected.copy(holder.position).project(camera);
    field.uLensCenter.value.set(projected.x * .5 + .5, projected.y * .5 + .5);
    field.uTypeMotion.value.set(state.word, state.shift);
    renderer.render(scene, camera);
  }
  function dispose() {
    texture.dispose(); disposeTree(scene);
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  }
  resize(el.clientWidth, el.clientHeight);
  attach(renderer.domElement, el);
  return { frame, resize, dispose };
}

function canvasLens(el, mark, reduced, dark, rings = false) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { disposeTree(mark); throw new Error('Canvas unavailable'); }
  const word = document.createElement('canvas');
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 60);
  const size = new THREE.Box3().setFromObject(mark).getSize(new THREE.Vector3());
  const motion = makeMotion(reduced, rings), holder = new THREE.Object3D();
  const paper = dark ? NIGHT : PAPER;
  // Same alpha mask, with pale ink for the dark optical field.
  const ink = document.createElement('canvas');
  function refreshInk() {
    ink.width = word.width; ink.height = word.height;
    const ic = ink.getContext('2d');
    ic.drawImage(word, 0, 0);
    if (dark) { ic.globalCompositeOperation = 'source-in'; ic.fillStyle = '#e9eff9'; ic.fillRect(0,0,ink.width,ink.height); }
  }
  const faces = [], point = new THREE.Vector3();
  for (const mesh of mark.children) {
    const geo = mesh.geometry, pos = geo.getAttribute('position'), normals = geo.getAttribute('normal');
    const index = geo.getIndex(), count = index?.count || pos.count;
    for (let i = 0; i < count; i += 3) {
      const vertex = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i + k) : i + k));
      vertex.forEach(v => v.applyMatrix4(mesh.matrixWorld));
      const n = new THREE.Vector3().fromBufferAttribute(normals, index ? index.getX(i) : i);
      for (let j = 1; j < 3; j++) n.add(point.fromBufferAttribute(normals, index ? index.getX(i + j) : i + j));
      n.normalize();
      const centroid = new THREE.Vector3().add(vertex[0]).add(vertex[1]).add(vertex[2]).multiplyScalar(1 / 3);
      faces.push({ vertex, n, centroid, points: vertex.map(() => new THREE.Vector3()), view: new THREE.Vector3() });
    }
  }
  disposeTree(mark);
  const normalMat = new THREE.Matrix3(), modelView = new THREE.Matrix4(), clip = new THREE.Matrix4();
  const normal = new THREE.Vector3(), direction = new THREE.Vector3(), ray = new THREE.Vector3();
  const hit = new THREE.Vector3(), incidentClip = new THREE.Vector3(), reflection = new THREE.Vector3();
  const visible = [];
  let w = 0, h = 0, dpr = 0, ringSpacing = RING_SPACING_PX;
  function resize(width, height) {
    const ww = Math.max(1, width), hh = Math.max(1, height);
    // Software refraction draws every visible facet; keep its backing buffer
    // bounded on a large desktop while retaining phone resolution unchanged.
    const dd = Math.min(pixelRatio(ww, hh), Math.sqrt(900000 / (ww * hh)));
    if (ww === w && hh === h && dd === dpr) return;
    w = ww; h = hh; dpr = dd;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    fit(camera, w, h, size);
    if (rings) {
      ringSpacing = adaptiveRingSpacing(w,h,RING_SPACING_PX);
      drawRings(ink,w,h,0,dark,ringSpacing);
    }
    else { drawWord(word, w, h); refreshInk(); }
  }
  function frame(t, dt, input) {
    const viewH = camera.position.z * 2 * TAN;
    const state = motion(t, dt, input, viewH * camera.aspect, viewH);
    holder.position.set(state.x, state.y, 0); holder.rotation.set(state.pitch, state.yaw, state.roll);
    holder.scale.setScalar(state.scale);
    holder.updateMatrix();
    modelView.multiplyMatrices(camera.matrixWorldInverse, holder.matrix);
    clip.multiplyMatrices(camera.projectionMatrix, modelView);
    normalMat.getNormalMatrix(modelView);
    point.copy(holder.position).project(camera);
    const cx = w * (.5 + point.x * .5), cy = h * (.5 - point.y * .5);
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    ctx.fillStyle = paper; ctx.fillRect(0, 0, w, h);
    if (rings) drawRings(ink,w,h,reduced ? 0 : t,dark,ringSpacing);
    else {
    ctx.save(); ctx.translate(cx + w * .019, cy + h * .207); ctx.scale(w * .283, h * .073);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.22);
    shadow.addColorStop(0, 'rgba(85,114,155,.09)'); shadow.addColorStop(1, 'rgba(85,114,155,0)');
    ctx.fillStyle = shadow; ctx.fillRect(-1.3, -1.3, 2.6, 2.6); ctx.restore();
    ctx.save(); ctx.translate(cx + w * .012, cy + h * .205); ctx.scale(w * .29, h * .076);
    ctx.strokeStyle = dark ? `rgba(72,147,255,${.13 + state.pressure*.08})` : `rgba(84,151,242,${.065 + state.pressure*.04})`;
    ctx.lineWidth = .06; ctx.beginPath(); ctx.arc(0,0,.68+.07*state.pressure,.2,2.1); ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = state.word;
    ctx.drawImage(ink, 0, rings ? 0 : state.shift * h, w, h);
    ctx.globalAlpha = 1;
    visible.length = 0;
    for (const face of faces) {
      const pp = face.points;
      for (let j = 0; j < 3; j++) {
        const p = pp[j].copy(face.vertex[j]).applyMatrix4(clip);
        p.x = w * (.5 + p.x * .5); p.y = h * (.5 - p.y * .5);
      }
      if ((pp[1].x - pp[0].x) * (pp[2].y - pp[0].y) - (pp[1].y - pp[0].y) * (pp[2].x - pp[0].x) >= -.025) continue;
      face.view.copy(face.centroid).applyMatrix4(modelView);
      visible.push(face);
    }
    visible.sort((a, b) => a.view.z - b.view.z);
    for (const { points: p, view, n } of visible) {
      normal.copy(n).applyMatrix3(normalMat).normalize();
      direction.copy(view).normalize();
      const facing = clamp(-normal.dot(direction), 0, 1), grazing = (1 - facing) ** 1.72;
      const eta = 1 / 1.49;
      ray.copy(direction).multiplyScalar(eta).addScaledVector(normal, eta * facing - Math.sqrt(1 - eta * eta * (1 - facing * facing)));
      const travel = clamp(camera.position.z + size.z * .48 + .35 + view.z, .31, 2.45);
      hit.copy(view).addScaledVector(ray, travel / Math.max(.27, -ray.z)).applyMatrix4(camera.projectionMatrix);
      incidentClip.copy(view).applyMatrix4(camera.projectionMatrix);
      const mx = .5 * w * clamp((hit.x - incidentClip.x) * .5, -.104, .104) * (2 + .32*state.pressure);
      const my = -.5 * h * clamp((hit.y - incidentClip.y) * .5, -.104, .104) * (2 + .32*state.pressure);
      const mag = 1 / (1 - (.125 + facing * (.10 + .065 * state.pressure)));
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[2].x, p[2].y); ctx.closePath();
      ctx.save(); ctx.clip();
      const loX = Math.min(p[0].x, p[1].x, p[2].x) - 1, hiX = Math.max(p[0].x, p[1].x, p[2].x) + 1;
      const loY = Math.min(p[0].y, p[1].y, p[2].y) - 1, hiY = Math.max(p[0].y, p[1].y, p[2].y) + 1;
      ctx.fillStyle = paper; ctx.fillRect(loX, loY, hiX - loX, hiY - loY);
      ctx.globalAlpha = state.word;
      ctx.drawImage(ink, cx * (1 - mag) - mx * mag, cy * (1 - mag) + ((rings ? 0 : state.shift * h) - my) * mag, w * mag, h * mag);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(51,117,210,${.028 + grazing * .34 + Math.abs(normal.x) * .12 + Math.max(-normal.y,0)*.055 + (dark ? .032 : 0)})`;
      ctx.fillRect(loX, loY, hiX - loX, hiY - loY);
      reflection.copy(direction).reflect(normal);
      const panel = Math.exp(-((Math.abs((reflection.x + .35) / .68)) ** 4 + (Math.abs((reflection.y - .49) / .22)) ** 4));
      const rim = Math.exp(-(((reflection.x - .53) / .19) ** 2)) * smooth(-.68, .16, reflection.y);
      const gloss = ctx.createLinearGradient(loX, loY, hiX, hiY);
      gloss.addColorStop(0, `rgba(255,255,255,${.045 + panel * .50 + rim * .25})`);
      gloss.addColorStop(.52, `rgba(226,241,255,${.018 + panel * .18 + rim * .12})`);
      gloss.addColorStop(1, `rgba(255,255,255,${.055 + rim * .35})`);
      ctx.fillStyle = gloss; ctx.fillRect(loX, loY, hiX - loX, hiY - loY); ctx.restore();

    }
  }
  resize(el.clientWidth, el.clientHeight);
  attach(canvas, el);
  return { frame, resize, dispose: () => canvas.remove() };
}

export async function createLensHero({ el, signal, reduced, theme = 'light' }) {
  await document.fonts?.load('850 120px "WA Flex Wide"');
  const mark = await loadMark();
  if (signal?.aborted) { disposeTree(mark); throw new DOMException('Scene cancelled', 'AbortError'); }
  let renderer;
  try { renderer = makeRenderer(document.createElement('canvas')); }
  catch { return canvasLens(el, mark, reduced, theme === 'dark'); }
  return gpuLens(el, mark, reduced, renderer, theme === 'dark');
}

// Kept separate so the original word lens retains its typography, timing,
// background shader and all three-dimensional material choices unchanged.
export async function createRingLensHero({ el, signal, reduced, theme = 'light' }) {
  const mark = await loadMark();
  if (signal?.aborted) { disposeTree(mark); throw new DOMException('Scene cancelled', 'AbortError'); }
  let renderer;
  try { renderer = makeRenderer(document.createElement('canvas')); }
  catch { return canvasLens(el,mark,reduced,theme === 'dark',true); }
  return gpuLens(el,mark,reduced,renderer,theme === 'dark',true);
}
