import * as THREE from 'three';
import { makeStudio } from '../mark-kit.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mix = (a, b, p) => a + (b - a) * p;
const ease = x => { const p = clamp(x, 0, 1); return p * p * (3 - 2 * p); };
const damp = (a, b, dt, rate = 7) => mix(a, b, 1 - Math.exp(-rate * clamp(dt || 1 / 60, 0, .05)));
const full = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';

// Original vector lettering on a shared 100-unit cap-height grid. The same
// contours generate the ink and the shadow, so their edges never drift apart.
const glyphs = [
  { x: 0, contours: [
    [[0,29],[6,18],[20,11],[47,11],[47,0],[71,0],[71,11],[98,11],[112,18],[118,29],[118,70],[112,81],[98,88],[71,88],[71,100],[47,100],[47,88],[20,88],[6,81],[0,70]],
    [[24,33],[30,28],[47,28],[47,71],[30,71],[24,66]], [[71,28],[88,28],[94,33],[94,66],[88,71],[71,71]],
  ] },
  { x: 127, contours: [
    [[0,19],[9,6],[23,0],[94,0],[108,6],[117,19],[117,81],[108,94],[94,100],[23,100],[9,94],[0,81]],
    [[24,24],[29,19],[88,19],[93,24],[93,76],[88,81],[29,81],[24,76]],
  ] },
  { x: 254, contours: [
    [[0,0],[86,0],[101,6],[108,18],[108,48],[101,60],[86,66],[24,66],[24,100],[0,100]],
    [[24,18],[77,18],[84,23],[84,43],[77,48],[24,48]],
  ] },
  { x: 372, contours: [
    [[0,0],[30,0],[65,47],[100,0],[130,0],[130,100],[106,100],[106,33],[77,73],[53,73],[24,33],[24,100],[0,100]],
  ] },
  { x: 506, contours: [
    [[45,0],[78,0],[125,100],[98,100],[87,77],[36,77],[25,100],[0,100]],
    [[61.5,19],[77.5,58],[45.5,58]],
  ] },
];
const outlines = glyphs.flatMap(g => g.contours.map(poly => poly.map(([x,y]) => [x+g.x,y])));
const typeWidth = 631;

function appendPoly(path, poly, dx = 0, dy = 0) {
  path.moveTo(poly[0][0] + dx, poly[0][1] + dy);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0] + dx, poly[i][1] + dy);
  path.closePath();
}

export async function createType({el, signal, reduced}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = full;
  canvas.setAttribute('aria-label','ФОРМА — геометрическая типографика и её проекция');
  const g = canvas.getContext('2d', {alpha: true});
  if (!g) throw new Error('Canvas 2D is unavailable');
  el.append(canvas);
  const lettering = new Path2D();
  for (const poly of outlines) appendPoly(lettering, poly);
  let w = 1, h = 1, ratio = 1, px = 0, py = 0, lastFrame = null;
  let disposed = false;

  function resize(width,height) {
    w = Math.max(width,1); h = Math.max(height,1);
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w*ratio); canvas.height = Math.round(h*ratio);
    lastFrame = null;
  }
  function frame(t, dt, input = {}) {
    if (disposed) return;
    const responsive = w < 550;
    const animated = !reduced;
    const stage = animated ? ease((t - .10) / 1.5) : 1;
    const xTarget = animated && (input.active || input.dragging) ? clamp(input.x || 0,-1,1) : 0;
    const yTarget = animated && (input.active || input.dragging) ? clamp(input.y || 0,-1,1) : 0;
    px = damp(px, xTarget, dt); py = damp(py, yTarget, dt);
    const dx = (112 - px * 133) * stage;
    const dy = (117 - py * 56) * stage;
    if (lastFrame && Math.abs(lastFrame[0] - dx) + Math.abs(lastFrame[1] - dy) < .025) return;
    lastFrame = [dx,dy];
    g.setTransform(ratio, 0, 0, ratio, 0, 0); g.clearRect(0,0,w,h);
    const scale = Math.min(w * (responsive ? .88 : .79) / (typeWidth + 151), h * .62 / 245);
    const x = w * .5 - (typeWidth + 104) * scale * .5;
    const y = h * (responsive ? .50 : .52) - 101 * scale;
    g.translate(x,y); g.scale(scale,scale);
    if (stage > .001) {
      const shadow = new Path2D();
      const farFace = new Path2D();
      for (const poly of outlines) {
        appendPoly(farFace, poly, dx, dy);
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i+1) % poly.length];
          const quad = [a,b,[b[0]+dx,b[1]+dy],[a[0]+dx,a[1]+dy]];
          if ((b[0]-a[0])*dy - (b[1]-a[1])*dx < 0) quad.reverse();
          appendPoly(shadow, quad);
        }
      }
      const cobalt = g.createLinearGradient(typeWidth*.47, 51, typeWidth*.47+dx, 51+dy);
      cobalt.addColorStop(0,'#143bdf');
      cobalt.addColorStop(.70,'#3158f5');
      cobalt.addColorStop(1,'#4a70ff');
      g.fillStyle = cobalt;
      g.fill(farFace,'evenodd');
      g.fill(shadow);
    }
    g.fillStyle = '#11131b';
    g.fill(lettering,'evenodd');
  }
  function dispose() {
    if (disposed) return; disposed = true;
    signal?.removeEventListener('abort', dispose);
    canvas.remove(); canvas.width = canvas.height = 1;
  }
  signal?.addEventListener('abort', dispose, {once:true});
  resize(el.clientWidth,el.clientHeight);
  frame(0,0);
  return {frame,resize,dispose};
}

const TAU = Math.PI*2;
const RINGS = 132;
const CROSS = [[-.88,-1],[.88,-1],[1,-.48],[1,.48],[.88,1],[-.88,1],[-1,.48],[-1,-.48]];
const SIDES = CROSS.length;

function buildRibbon() {
  const geometry = new THREE.BufferGeometry();
  const points = new THREE.BufferAttribute(new Float32Array((RINGS+1)*SIDES*3),3);
  points.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',points);
  const indices = [];
  for (let i=0;i<RINGS;i++) for (let j=0;j<SIDES;j++) {
    const a=i*SIDES+j, b=i*SIDES+(j+1)%SIDES;
    indices.push(a,b,a+SIDES,b,b+SIDES,a+SIDES);
  }
  const beltIndex = new THREE.BufferAttribute(new Uint16Array(indices),1);
  for (let j=1;j<SIDES-1;j++) {
    indices.push(0,j+1,j);
    indices.push(RINGS*SIDES,RINGS*SIDES+j,RINGS*SIDES+j+1);
  }
  const openIndex = new THREE.BufferAttribute(new Uint16Array(indices),1);
  geometry.setIndex(openIndex);
  let previous = '', wasJoined = false;
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3();
  const wide = new THREE.Vector3(), thick = new THREE.Vector3(), center = new THREE.Vector3();
  function shape(open, inflate, length) {
    const key = `${open.toFixed(5)},${inflate.toFixed(5)},${length.toFixed(5)}`;
    if (previous === key) return;
    previous=key;
    const curvature=Math.max(.0001,open);
    const arc=TAU*curvature;
    const radius=2.13 + .14*Math.sin(Math.PI*curvature) - .12*(1-curvature)**3;
    const a=radius/Math.sin(Math.min(Math.PI*curvature,Math.PI*.5));
    const b=1.38*(.39+.61*curvature)/curvature;
    const mid=b*(1-Math.cos(arc*.5))*.5;
    for(let i=0;i<=RINGS;i++) {
      const u=.5 + (i/RINGS-.5)*length;
      const theta=arc*(u-.5), sin=Math.sin(theta), cos=Math.cos(theta);
      const z=.27*Math.sin(theta+.45)+.18*Math.sin(theta*2-.5);
      const zd=.27*Math.cos(theta+.45)+.36*Math.cos(theta*2-.5);
      center.set(a*sin,b*(1-cos)-mid-.43*(1-curvature),curvature*z);
      tangent.set(a*cos,b*sin,curvature*zd).normalize();
      normal.set(-tangent.y,tangent.x,0).normalize();
      binormal.crossVectors(tangent,normal).normalize();
      const twist=Math.PI*(u-.36)*curvature;
      const c=Math.cos(twist),s=Math.sin(twist);
      wide.copy(normal).multiplyScalar(c).addScaledVector(binormal,s);
      thick.copy(normal).multiplyScalar(-s).addScaledVector(binormal,c);
      const width=mix(.017,.43,inflate);
      const depth=mix(.014,.038,inflate);
      for(let j=0;j<SIDES;j++) {
        const [wx,wy]=CROSS[j], side=wx*width, surface=wy*depth;
        points.setXYZ(i*SIDES+j,center.x+side*wide.x+surface*thick.x,center.y+side*wide.y+surface*thick.y,center.z+side*wide.z+surface*thick.z);
      }
    }
    const joined=open>.99999&&length>.99999;
    if (joined !== wasJoined) { geometry.setIndex(joined ? beltIndex : openIndex); wasJoined=joined; }
    points.needsUpdate=true;
    geometry.computeVertexNormals();
    if (joined) {
      // A Möbius band closes with its cross-section reversed. Smooth its seam
      // using the matching vertices on the opposite side of the last ring.
      const normals=geometry.attributes.normal;
      const aN=new THREE.Vector3(), bN=new THREE.Vector3();
      for(let i=0;i<SIDES;i++) {
        const last=RINGS*SIDES+(i+SIDES/2)%SIDES;
        aN.fromBufferAttribute(normals,i); bN.fromBufferAttribute(normals,last);
        aN.add(bN).normalize();
        normals.setXYZ(i,aN.x,aN.y,aN.z); normals.setXYZ(last,aN.x,aN.y,aN.z);
      }
      normals.needsUpdate=true;
    }
  }
  return {geometry,shape};
}

function makeRibbonMotion(reduced) {
  let px=0, py=0;
  return (t,dt,input={}) => {
    const cursor = !reduced&&(input.active||input.dragging);
    const desiredX=cursor ? clamp((input.x||0)*.19 + (input.dragging ? (input.dragX||0)*.08 : 0),-.42,.42):0;
    const desiredY=cursor ? clamp((input.y||0)*.16 + (input.dragging ? (input.dragY||0)*.06 : 0),-.33,.33):0;
    px=damp(px,desiredX,dt,5); py=damp(py,desiredY,dt,5);
    const open=reduced?1:ease((t-.23)/1.53);
    const inflate=reduced?1:ease((t-.25)/1.24);
    const length=reduced?1:mix(.028,1,ease(t/.48));
    const breathe=reduced?0:Math.sin(Math.max(0,t-1.8)*.66)*.035;
    const sweep=reduced ? 1 : clamp((t-1.27)/.82,0,1);
    const glint=Math.sin(Math.PI*sweep)**2;
    return {open,inflate,length,rx:mix(.12,.31,open)+py+breathe,ry:-.26+px,rz:mix(0,-.23,open),y:.07+breathe*.38,
      lightX:mix(2.8-px*5,Math.cos(TAU*sweep)*4,glint),lightY:mix(3.6-py*4,Math.sin(TAU*sweep)*3,glint),glint};
  };
}

function ribbonShadow() {
  const shadow=document.createElement('div');
  shadow.style.cssText='position:absolute;pointer-events:none;left:50%;top:72%;width:min(54%,520px);height:8%;transform:translate(-50%,-50%);background:radial-gradient(ellipse,rgba(54,67,118,.20) 0%,rgba(71,83,134,.07) 43%,transparent 70%);opacity:0';
  return shadow;
}

function createRibbonCanvas({el, signal, reduced}) {
  const canvas=document.createElement('canvas');
  canvas.style.cssText=full;
  canvas.setAttribute('aria-label','Объёмная кобальтовая лента с перекрутом');
  const g=canvas.getContext('2d',{alpha:true});
  if(!g) throw new Error('Canvas 2D is unavailable');
  const shadow=ribbonShadow();
  el.append(shadow,canvas);
  const {geometry,shape}=buildRibbon();
  const motion=makeRibbonMotion(reduced);
  const camera=new THREE.PerspectiveCamera(32,1,.1,100);
  const matrix=new THREE.Matrix4(), transform=new THREE.Matrix4(), rotation=new THREE.Euler();
  const light=new THREE.Vector3(), half=new THREE.Vector3();
  const projected=new Float32Array((RINGS+1)*SIDES*6);
  let w=1,h=1,image,zBuffer,disposed=false,lastTime=-1;
  function resize(width,height) {
    width=Math.max(width,1); height=Math.max(height,1);
    const aspect=width/height;
    const dpr=Math.min(window.devicePixelRatio||1,1.35,960/width,610/height);
    w=canvas.width=Math.max(1,Math.round(width*dpr));
    h=canvas.height=Math.max(1,Math.round(height*dpr));
    image=g.createImageData(w,h); zBuffer=new Float32Array(w*h);
    camera.aspect=aspect;
    camera.position.set(0,.27,Math.max(8.9,10.3/aspect));
    camera.lookAt(0,-.06,0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    lastTime=-1;
  }
  function frame(t,dt,input={}) {
    if(disposed || !image) return;
    const pose=motion(t,dt,input);
    if (lastTime>=0 && t>lastTime && t-lastTime<.024) return;
    lastTime=t;
    shape(pose.open,pose.inflate,pose.length);
    transform.makeRotationFromEuler(rotation.set(pose.rx,pose.ry,pose.rz));
    transform.setPosition(0,pose.y,0);
    matrix.multiplyMatrices(camera.matrixWorldInverse,transform);
    const m=matrix.elements,p=camera.projectionMatrix.elements;
    const hx=w*.5,hy=h*.5;
    light.set(pose.lightX,pose.lightY,4.2).normalize();
    half.copy(light); half.z+=1; half.normalize();
    const vertices=geometry.attributes.position.array,normals=geometry.attributes.normal.array;
    for(let i=0,j=0;i<vertices.length;i+=3,j+=6) {
      const x=vertices[i],y=vertices[i+1],z=vertices[i+2];
      const reciprocal=-1/(m[2]*x+m[6]*y+m[10]*z+m[14]);
      projected[j]=hx+(m[0]*x+m[4]*y+m[8]*z+m[12])*p[0]*reciprocal*hx;
      projected[j+1]=hy-(m[1]*x+m[5]*y+m[9]*z+m[13])*p[5]*reciprocal*hy;
      projected[j+2]=reciprocal;
      const a=normals[i],b=normals[i+1],c=normals[i+2];
      const nx=m[0]*a+m[4]*b+m[8]*c,ny=m[1]*a+m[5]*b+m[9]*c,nz=m[2]*a+m[6]*b+m[10]*c;
      const key=Math.max(0,nx*light.x+ny*light.y+nz*light.z);
      const fill=Math.max(0,-nx*.64+ny*.17+nz*.75);
      const rim=(1-Math.max(0,nz))**2 * Math.max(0,.45-.65*nx+.24*ny);
      const gloss=Math.max(0,nx*half.x+ny*half.y+nz*half.z)**35*(.95+.64*pose.glint)
        +Math.max(0,-nx*.49+ny*.30+nz*.819)**24*.46;
      projected[j+3]=13+32*key+18*fill+113*gloss+33*rim;
      projected[j+4]=26+56*key+33*fill+124*gloss+52*rim;
      projected[j+5]=77+116*key+46*fill+73*gloss+73*rim;
    }
    const rgba=image.data, index=geometry.index.array;
    rgba.fill(0); zBuffer.fill(0);
    for(let i=0;i<index.length;i+=3) {
      const a=index[i]*6,b=index[i+1]*6,c=index[i+2]*6;
      const ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];
      const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(area>=-.0001) continue;
      const inv=1/area;
      const xMin=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),xMax=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5));
      const yMin=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),yMax=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
      const wAx=(by-cy)*inv,wBx=(cy-ay)*inv;
      const wAy=(cx-bx)*inv,wBy=(ax-cx)*inv;
      const depthA=projected[a+2]-projected[c+2],depthB=projected[b+2]-projected[c+2];
      for(let y=yMin;y<=yMax;y++) {
        let wa=(xMin+.5-cx)*wAx+(y+.5-cy)*wAy,wb=(xMin+.5-cx)*wBx+(y+.5-cy)*wBy;
        for(let x=xMin,pixel=y*w+xMin;x<=xMax;x++,pixel++,wa+=wAx,wb+=wBx) {
          const wc=1-wa-wb;
          if(wa<-.00001||wb<-.00001||wc<-.00001) continue;
          const depth=projected[c+2]+wa*depthA+wb*depthB;
          if(depth<=zBuffer[pixel]) continue;
          zBuffer[pixel]=depth;
          const out=pixel*4;
          rgba[out]=wa*projected[a+3]+wb*projected[b+3]+wc*projected[c+3];
          rgba[out+1]=wa*projected[a+4]+wb*projected[b+4]+wc*projected[c+4];
          rgba[out+2]=wa*projected[a+5]+wb*projected[b+5]+wc*projected[c+5];
          rgba[out+3]=255;
        }
      }
    }
    g.putImageData(image,0,0);
    shadow.style.opacity=String(pose.open*.8);
  }
  function dispose() {
    if(disposed) return; disposed=true;
    signal?.removeEventListener('abort',dispose);
    geometry.dispose(); canvas.remove(); shadow.remove();
    canvas.width=canvas.height=1; image=zBuffer=null;
  }
  signal?.addEventListener('abort',dispose,{once:true});
  resize(el.clientWidth,el.clientHeight); frame(0,0);
  return {frame,resize,dispose};
}

export async function createRibbon(ctx) {
  const {el, signal, reduced}=ctx;
  const canvas=document.createElement('canvas');
  const settings={alpha:true,antialias:true,powerPreference:'high-performance'};
  let gl,renderer;
  try {
    gl=canvas.getContext('webgl2',settings);
    if(gl) renderer=new THREE.WebGLRenderer({...settings,canvas,context:gl});
  } catch { gl?.getExtension('WEBGL_lose_context')?.loseContext(); }
  if(!renderer) return createRibbonCanvas(ctx);
  renderer.setClearColor(0,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.17;
  renderer.domElement.style.cssText=full;
  renderer.domElement.setAttribute('aria-label','Объёмная кобальтовая лента с перекрутом');
  const shadow=ribbonShadow();
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(32,1,.1,100);
  let cleanupStudio;
  try { cleanupStudio=makeStudio(renderer,scene); }
  catch { renderer.dispose(); renderer.forceContextLoss(); return createRibbonCanvas(ctx); }
  el.append(shadow,renderer.domElement);
  const {geometry,shape}=buildRibbon();
  const material=new THREE.MeshPhysicalMaterial({
    color:0x1f43e4, metalness:.64, roughness:.28, clearcoat:.57, clearcoatRoughness:.19,
    envMapIntensity:1.45, iridescence:.12, iridescenceIOR:1.34,
    iridescenceThicknessRange:[110,285],
  });
  const object=new THREE.Mesh(geometry,material);
  object.frustumCulled=false;
  scene.add(object);
  const accent=new THREE.DirectionalLight(0xb3d4ff,2.35);
  accent.position.set(2.8,3.6,4.2); scene.add(accent);
  const rim=new THREE.DirectionalLight(0x7697ff,2.5);
  rim.position.set(-4,1.4,-3); scene.add(rim);
  let disposed=false;
  const motion=makeRibbonMotion(reduced);
  function resize(width,height) {
    const w=Math.max(width,1),h=Math.max(height,1);
    const aspect=w/h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,aspect<1?1.6:1.85));
    renderer.setSize(w,h,false);
    camera.aspect=aspect;
    camera.position.set(0,.27,Math.max(8.9,10.3/aspect));
    camera.lookAt(0,-.06,0); camera.updateProjectionMatrix();
  }
  function frame(t,dt,input={}) {
    if(disposed)return;
    const pose=motion(t,dt,input);
    shape(pose.open,pose.inflate,pose.length);
    object.rotation.set(pose.rx,pose.ry,pose.rz);
    object.position.y=pose.y;
    accent.position.x=pose.lightX; accent.position.y=pose.lightY;
    accent.intensity=2.35+1.7*pose.glint;
    shadow.style.opacity=String(pose.open*.80);
    renderer.render(scene,camera);
  }
  function dispose() {
    if(disposed)return; disposed=true;
    signal?.removeEventListener('abort',dispose);
    geometry.dispose(); material.dispose();
    cleanupStudio?.(); renderer.dispose();
    renderer.forceContextLoss();
    shadow.remove(); renderer.domElement.remove();
  }
  signal?.addEventListener('abort',dispose,{once:true});
  resize(el.clientWidth,el.clientHeight); frame(0,0);
  return {frame,resize,dispose};
}
