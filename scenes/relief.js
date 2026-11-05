import { loadMark } from '../mark-kit.js';
import { adaptiveRingSpacing } from '../mobile/scenes/ring-density.js';

const TAU = 2 * Math.PI;
const ANGLE = .39;
const C = Math.cos(ANGLE), S = Math.sin(ANGLE);
const FLATTEN = .66, LIFT = .77;
const FIELD_X = 3.08, FIELD_Y = 2.31;
const NX = 385, NY = 289;
const DX = 2 * FIELD_X / (NX - 1), DY = 2 * FIELD_Y / (NY - 1);
const DIAG = Math.hypot(DX, DY);
const RISE = .27, BEVEL = .24;
const STEPS = 768;
const COS = new Float32Array(STEPS), SIN = new Float32Array(STEPS);
const OCCLUSION_STEP = .064;
const HEARTBEAT_PERIOD = 1.76;
for (let i = 0; i < STEPS; i++) {
  COS[i] = Math.cos(i * TAU / STEPS);
  SIN[i] = Math.sin(i * TAU / STEPS);
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { const v = clamp(x, 0, 1); return v*v*(3 - 2*v); };

let fieldPromise;

async function getField() {
  if (!fieldPromise) fieldPromise = buildField().catch(error => { fieldPromise = undefined; throw error; });
  return fieldPromise;
}

async function buildField() {
  const mark = await loadMark();
  const mask = new Uint8Array(NX * NY);
  try {
    mark.updateMatrixWorld(true);
    mark.traverse(mesh => {
      if (!mesh.isMesh) return;
      const {geometry, matrixWorld} = mesh;
      const pos = geometry.attributes.position, indices = geometry.index;
      const n = indices?.count ?? pos.count;
      const e = matrixWorld.elements;
      const vertices = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        vertices[i*2] = (e[0]*x + e[4]*y + e[8]*z + e[12] + FIELD_X)/DX;
        vertices[i*2+1] = (FIELD_Y - (e[1]*x + e[5]*y + e[9]*z + e[13]))/DY;
      }
      // Union the actual projected triangles. No hand-drawn outline, and no
      // gaps where the duplicated GLB facets or the three parts meet.
      for (let i = 0; i < n; i += 3) {
        const a = (indices ? indices.getX(i) : i)*2;
        const b = (indices ? indices.getX(i+1) : i+1)*2;
        const c = (indices ? indices.getX(i+2) : i+2)*2;
        const ax=vertices[a], ay=vertices[a+1], bx=vertices[b], by=vertices[b+1], cx=vertices[c], cy=vertices[c+1];
        const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
        if (Math.abs(area)<1e-5) continue;
        const left=Math.max(0,Math.ceil(Math.min(ax,bx,cx))), right=Math.min(NX-1,Math.floor(Math.max(ax,bx,cx)));
        const top=Math.max(0,Math.ceil(Math.min(ay,by,cy))), bottom=Math.min(NY-1,Math.floor(Math.max(ay,by,cy)));
        const axStep=(by-cy)/area, ayStep=(cx-bx)/area;
        const bxStep=(cy-ay)/area, byStep=(ax-cx)/area;
        for (let y=top; y<=bottom; y++) {
          let wa=(left-cx)*axStep+(y-cy)*ayStep;
          let wb=(left-cx)*bxStep+(y-cy)*byStep;
          for (let x=left; x<=right; x++,wa+=axStep,wb+=bxStep) {
            if (wa>=-.0001 && wb>=-.0001 && wa+wb<=1.0001) mask[y*NX+x]=1;
          }
        }
      }
    });
  } finally {
    mark.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
      else mesh.material?.dispose();
    });
  }
  const height = new Float32Array(NX*NY);
  for (let i=0;i<height.length;i++) height[i] = mask[i] ? 1e3 : 0;
  // An inward bevel keeps every sample outside the footprint on the plane.
  for (let y=1;y<NY-1;y++) for (let x=1;x<NX-1;x++) {
    const i=y*NX+x;
    if (mask[i]) height[i] = Math.min(height[i],height[i-1]+DX,height[i-NX]+DY,height[i-NX-1]+DIAG,height[i-NX+1]+DIAG);
  }
  for (let y=NY-2;y>0;y--) for (let x=NX-2;x>0;x--) {
    const i=y*NX+x;
    if (mask[i]) height[i] = Math.min(height[i],height[i+1]+DX,height[i+NX]+DY,height[i+NX+1]+DIAG,height[i+NX-1]+DIAG);
  }
  // Round the slope only on the inside of the footprint. The quintic
  // shoulder has zero first and second derivatives where it meets the plane
  // and the flat top. A compact filter removes the remaining grid imprint.
  for (let i=0;i<height.length;i++) {
    const t=clamp((height[i]-.011)/BEVEL,0,1);
    height[i]=RISE*t*t*t*(t*(6*t-15)+10);
  }
  const rounded=height.slice();
  for(let y=1;y<NY-1;y++) for(let x=1;x<NX-1;x++){
    const i=y*NX+x;
    if(mask[i]) rounded[i]=(4*height[i]+2*(height[i-1]+height[i+1]+height[i-NX]+height[i+NX])+height[i-NX-1]+height[i-NX+1]+height[i+NX-1]+height[i+NX+1])/16;
  }
  return rounded;
}

function sample(height, x, y) {
  if (x<=-FIELD_X || x>=FIELD_X || y<=-FIELD_Y || y>=FIELD_Y) return 0;
  const gx=(x+FIELD_X)/DX, gy=(y+FIELD_Y)/DY;
  const ix=Math.min(gx|0,NX-2), iy=Math.min(gy|0,NY-2), fx=gx-ix, fy=gy-iy;
  const i=iy*NX+ix;
  const a=height[i] + (height[i+1]-height[i])*fx;
  const b=height[i+NX] + (height[i+NX+1]-height[i+NX])*fx;
  return a + (b-a)*fy;
}

function hiddenByRelief(height,x,y,z,lift) {
  // Orthographic viewing rays keep screen x constant. If a nearer point
  // rises above this screen y, the blue surface covers this bit of line.
  const reach=(RISE-z)*lift/FLATTEN;
  if (reach<OCCLUSION_STEP || Math.abs(x)>FIELD_X+.17 || Math.abs(y)>FIELD_Y+.34) return false;
  for (let d=OCCLUSION_STEP;d<reach;d+=OCCLUSION_STEP) {
    if ((sample(height,x-S*d,y+C*d)-z)*lift>FLATTEN*d+.005) return true;
  }
  return false;
}

function beat(t,start,peak,end) {
  return t<peak ? smooth((t-start)/(peak-start)) : 1-smooth((t-peak)/(end-peak));
}

function heartbeat(t) {
  const cycle=Math.max(0,t-.98)%HEARTBEAT_PERIOD;
  const lub=beat(cycle,0,.16,.45);
  const dub=beat(cycle,.36,.49,.82);
  return smooth((t-.08)/.90)*(.54+.89*lub+.58*dub);
}

export async function createRelief(ctx) {
  return createReliefScene(ctx,false);
}

export async function createPulseRelief(ctx) {
  return createReliefScene(ctx,true);
}

async function createReliefScene({el, signal, reduced},pulse) {
  const height = await getField();
  if (signal?.aborted) return {frame(){},resize(){},dispose(){}};
  const canvas=document.createElement('canvas');
  canvas.setAttribute('aria-label',pulse ? 'Монограмма пульсирует, меняя высоту рельефа под расходящимися линиями' : 'Расходящиеся линии на синей плоскости поднимаются над рельефом монограммы');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  const g=canvas.getContext('2d',{alpha:false});
  const backdrop=document.createElement('canvas');
  const bg=backdrop.getContext('2d',{alpha:false});
  if (!g || !bg) throw new Error('Canvas 2D is unavailable');
  el.append(canvas);
  let w=1,h=1,ratio=1,scale=1,originX=0,originY=0,ringCount=1,step=.16,baseStep=.16;
  let mx=0,my=0,last=-1,disposed=false;

  function resize(width,height) {
    if (disposed) return;
    w=Math.max(width,1); h=Math.max(height,1);
    ratio=Math.min(window.devicePixelRatio||1,2,1700/w,1040/h);
    canvas.width=backdrop.width=Math.round(w*ratio);
    canvas.height=backdrop.height=Math.round(h*ratio);
    const narrow=w<580;
    scale=Math.min(w/(narrow?7.72:10.45),h/(narrow?4.44:5.20));
    originX=w*.5; originY=h*.515;
    baseStep=clamp(9.7/scale,.14,.178);
    step=baseStep*adaptiveRingSpacing(w,h,9.7)/9.7;
    const maxRadius=Math.hypot(w*.5/scale,h*.53/(scale*FLATTEN))+4.1;
    ringCount=Math.ceil(maxRadius/step);
    bg.setTransform(ratio,0,0,ratio,0,0);
    const blue=bg.createLinearGradient(w*.04,0,w*.94,h);
    blue.addColorStop(0,'#6283fa');
    blue.addColorStop(.32,'#4265f4');
    blue.addColorStop(.68,'#2847de');
    blue.addColorStop(1,'#172caa');
    bg.fillStyle=blue; bg.fillRect(0,0,w,h);
    const halo=bg.createRadialGradient(w*.27,h*.19,0,w*.27,h*.19,Math.max(w,h)*.66);
    halo.addColorStop(0,'rgba(188,222,255,.21)');
    halo.addColorStop(.66,'rgba(110,159,255,.06)');
    halo.addColorStop(1,'rgba(110,159,255,0)');
    bg.fillStyle=halo; bg.fillRect(0,0,w,h);
    bg.beginPath();
    const units=Math.ceil(maxRadius)+2, span=units*scale;
    for (let i=-units;i<=units;i++) {
      const q=i*scale;
      bg.moveTo(originX+C*q-S*span,originY+FLATTEN*(-S*q-C*span));
      bg.lineTo(originX+C*q+S*span,originY+FLATTEN*(-S*q+C*span));
      bg.moveTo(originX-C*span+S*q,originY+FLATTEN*(S*span+C*q));
      bg.lineTo(originX+C*span+S*q,originY+FLATTEN*(-S*span+C*q));
    }
    bg.lineWidth=.6; bg.strokeStyle='rgba(218,233,255,.105)'; bg.stroke();
    last=-1;
  }

  function frame(t,dt,input={}) {
    if (disposed || (last>=0 && t>last && t-last<.026)) return;
    if (t===last && !input.active && !input.dragging) return;
    if (pulse && last>=0 && t<last) mx=my=0;
    const elapsed=last>=0 && t>last ? t-last : dt;
    last=t;
    const active=!reduced && (input.active || input.dragging);
    const follow=1-Math.exp(-5.6*clamp(elapsed||1/60,0,.07));
    mx+=((active ? clamp(input.x||0,-1,1) : 0)-mx)*follow;
    my+=((active ? clamp(input.y||0,-1,1) : 0)-my)*follow;
    const rise=reduced ? 1 : smooth((t-.10)/1.55);
    const reveal=reduced ? 1 : .28 + .72*smooth(t/.78);
    const phase=reduced ? .31 : t*.84*baseStep/step+.25;
    const offset=phase-Math.floor(phase), bandOrigin=Math.floor(phase);
    const cx=-.83+mx*.38, cy=3.2+my*.29;
    // Only lift follows the heartbeat. Rings outside the mark keep their
    // original speed, and the blue underlay is unchanged.
    const amount=pulse ? (reduced ? 1 : heartbeat(t)) : rise*(reduced?1:.985+.015*Math.sin(Math.max(0,t-1.65)*1.24));
    const normalizedLift=LIFT*amount, lift=scale*normalizedLift;
    g.setTransform(1,0,0,1,0,0); g.drawImage(backdrop,0,0);
    g.setTransform(ratio,0,0,ratio,0,0);
    // Each ring lies in the plane, then samples the same physical relief.
    // The blue underlay has no logo, separate fill, or drawn boundary.
    for (let group=0;group<3;group++) {
      g.beginPath();
      for (let i=0;i<=ringCount;i++) {
        const pattern=((i-bandOrigin)%11+11)%11;
        const weight=pattern===0 ? 2 : pattern===5 ? 1 : 0;
        if (weight!==group) continue;
        const radius=(i+offset)*step;
        let penDown=false, startVisible=false, startU=0,startV=0;
        for (let j=0;j<STEPS;) {
          const x=cx+radius*COS[j], y=cy+radius*SIN[j];
          const z=sample(height,x,y);
          if (hiddenByRelief(height,x,y,z,normalizedLift)) penDown=false;
          else {
            const u=originX+scale*(C*x+S*y);
            const v=originY+scale*FLATTEN*(-S*x+C*y)-lift*z;
            if (j===0) { startVisible=true; startU=u; startV=v; }
            if (penDown) g.lineTo(u,v); else g.moveTo(u,v);
            penDown=true;
          }
          j+=radius<1.5 || Math.abs(x)>FIELD_X+.4 || Math.abs(y)>FIELD_Y+.4 ? 2 : 1;
        }
        if (penDown && startVisible) g.lineTo(startU,startV);
      }
      g.globalAlpha=reveal;
      g.strokeStyle=group===2?'rgba(225,240,255,.65)':group===1?'rgba(217,237,255,.48)':'rgba(208,230,255,.35)';
      g.lineWidth=group===2 ? .93 : group===1 ? .80 : .69;
      g.lineJoin='round'; g.stroke();
    }
    g.globalAlpha=1;
  }

  function dispose() {
    if (disposed) return;
    disposed=true;
    signal?.removeEventListener('abort',dispose);
    canvas.remove();
    canvas.width=canvas.height=backdrop.width=backdrop.height=1;
  }
  signal?.addEventListener('abort',dispose,{once:true});
  resize(el.clientWidth,el.clientHeight); frame(0,0);
  return {frame,resize,dispose};
}
