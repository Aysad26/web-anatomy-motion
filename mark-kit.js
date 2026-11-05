import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let geometryPromise;
const sourceUrl = new URL('./assets/02.glb', import.meta.url);
async function getOriginalParts() {
  const gltf = await new GLTFLoader().loadAsync(sourceUrl.href);
  gltf.scene.updateMatrixWorld(true);
  const geometries = [];
  const originalMaterials = new Set();
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    geometries.push(...splitGeometry(mesh));
    mesh.geometry.dispose();
    for (const material of [].concat(mesh.material)) originalMaterials.add(material);
  });
  originalMaterials.forEach(material => material.dispose());
  if (geometries.length !== 3) throw new Error('Expected the three closed volumes of the original WA mark');
  const bounds = new THREE.Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    bounds.union(geometry.boundingBox);
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 5.2 / bounds.getSize(new THREE.Vector3()).x;
  for (const geometry of geometries) {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometries.sort((a, b) => a.boundingBox.min.x - b.boundingBox.min.x);
}

export async function loadMark() {
  if (!geometryPromise) geometryPromise = getOriginalParts().catch(error => { geometryPromise = undefined; throw error; });
  const group = new THREE.Group();
  const geometries = await geometryPromise;
  for (const [index, geometry] of geometries.entries()) {
    const shape = geometry.clone();
    const pivot = shape.boundingBox.getCenter(new THREE.Vector3());
    shape.translate(-pivot.x, -pivot.y, -pivot.z);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x8da9cf, roughness: .22, metalness: .86, clearcoat: .28,
      clearcoatRoughness: .17, iridescence: .11, iridescenceIOR: 1.31,
      iridescenceThicknessRange: [215, 280],
      emissive: 0x162f54, emissiveIntensity: .05
    });
    const mesh = new THREE.Mesh(shape, material);
    mesh.position.copy(pivot);
    mesh.name = 'WA-' + (index + 1);
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

export function makeStudio(renderer, scene) {
  // A local HDR studio built from large daylight panels and one blue strip.
  // A tiny procedural map avoids third-party requests and keeps previews quick.
  const w = 256, h = 128;
  const data = new Uint16Array(w * h * 4);
  const half = THREE.DataUtils.toHalfFloat;
  const softbox = (u, v, x, y, sx, sy) => {
    const d = Math.abs(u - x);
    return Math.exp(-Math.pow(Math.min(d, 1 - d) / sx, 4) - Math.pow((v - y) / sy, 4));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const main = softbox(u, v, .72, .67, .126, .18) * 3.6;
    const fill = softbox(u, v, .25, .53, .075, .28) * 1.9;
    const rim = softbox(u, v, .48, .50, .04, .31) * 1.4;
    const top = Math.pow(v, 3) * .5;
    const i = (y * w + x) * 4;
    data[i] = half(.28 + main * .78 + fill * .75 + rim * .06 + top);
    data[i+1] = half(.35 + main * .90 + fill * .88 + rim * .28 + top);
    data[i+2] = half(.45 + main + fill + rim + top);
    data[i+3] = half(1);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex);
  scene.environment = env.texture;
  scene.environmentIntensity = 1.22;
  tex.dispose();
  pmrem.dispose();
  const hemisphere = new THREE.HemisphereLight(0xe3edff, 0x7588aa, 1.5);
  const key = new THREE.DirectionalLight(0xf0f6ff, 2.7);
  const blue = new THREE.DirectionalLight(0x4d83ff, 2.4);
  key.position.set(-3, 6, 5);
  blue.position.set(4, 2, -4);
  scene.add(hemisphere, key, blue);
  return () => {
    scene.remove(hemisphere, key, blue);
    if (scene.environment === env.texture) scene.environment = null;
    env.dispose();
  };
}

export function splitGeometry(mesh) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  if (mesh.matrixWorld.determinant() < 0) {
    for (const attribute of Object.values(geometry.attributes))
      for (let t = 0; t < attribute.count; t += 3) for (let k = 0; k < attribute.itemSize; k++) {
        const a = (t + 1) * attribute.itemSize + k, b = (t + 2) * attribute.itemSize + k;
        const value = attribute.array[a]; attribute.array[a] = attribute.array[b]; attribute.array[b] = value;
      }
  }
  const position = geometry.attributes.position, count = position.count / 3;
  const parents = Array.from({length: count}, (_, i) => i), edges = new Map();
  const find = i => {while (parents[i] !== i) {parents[i] = parents[parents[i]]; i = parents[i];} return i;};
  const key = i => [position.getX(i), position.getY(i), position.getZ(i)].map(value => value.toFixed(8)).join(',');
  for (let t = 0; t < count; t++) {
    const vertices = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    for (let j = 0; j < 3; j++) {
      const edge = [vertices[j], vertices[(j + 1) % 3]].sort().join('|');
      if (!edges.has(edge)) edges.set(edge, []); edges.get(edge).push(t);
    }
  }
  for (const triangles of edges.values()) if (triangles.length === 2) parents[find(triangles[0])] = find(triangles[1]);
  const groups = new Map();
  for (let t = 0; t < count; t++) {const parent = find(t); if (!groups.has(parent)) groups.set(parent, []); groups.get(parent).push(t);}
  const output = [];
  for (const triangles of groups.values()) {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const attribute = geometry.getAttribute(name); if (!attribute) continue;
      const array = [];
      for (const t of triangles) for (let j = 0; j < 3; j++) for (let k = 0; k < attribute.itemSize; k++) array.push(attribute.array[(t * 3 + j) * attribute.itemSize + k]);
      part.setAttribute(name, new THREE.Float32BufferAttribute(array, attribute.itemSize));
    }
    if (!part.attributes.normal) part.computeVertexNormals(); output.push(part);
  }
  geometry.dispose(); return output;
}
