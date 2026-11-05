import { loadMark } from '../../mark-kit.js';
import {adaptiveRingSpacing} from './ring-density.js';

const TAU=2*Math.PI, ANGLE=.24;
const C=Math.cos(ANGLE), S=Math.sin(ANGLE);
const FLATTEN=.70, LIFT=.86;
const FIELD_X=3.08, FIELD_Y=2.31, NX=385, NY=289;
const DX=2*FIELD_X/(NX-1), DY=2*FIELD_Y/(NY-1);
const RISE=.40, BEVEL=.235, OCCLUSION_STEP=.056;
const STEPS=384, COS=new Float32Array(STEPS+1), SIN=new Float32Array(STEPS+1);
for (let i=0;i<=STEPS;i++) {
  COS[i]=Math.cos(i*TAU/STEPS); SIN[i]=Math.sin(i*TAU/STEPS);
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const v=clamp(x,0,1); return v*v*(3-2*v);};

let fieldPromise;

async function getField() {
  if (!fieldPromise) fieldPromise = buildField().catch(error => { fieldPromise = undefined; throw error; });
  return fieldPromise;
}

// Split source edges at intersections, then keep only the actual union boundary.
// This excludes every internal triangulation edge from the fine upper rim.
function outlineBoundary(triangles){
 const cross=(ax,ay,bx,by)=>ax*by-ay*bx,edges=[];
 for(const p of triangles)for(let i=0;i<3;i++)if(Math.hypot(p[i][0]-p[(i+1)%3][0],p[i][1]-p[(i+1)%3][1])>1e-5)edges.push([p[i],p[(i+1)%3]]);
 function inside(x,y){return triangles.some(p=>{const a=cross(p[1][0]-p[0][0],p[1][1]-p[0][1],x-p[0][0],y-p[0][1]),b=cross(p[2][0]-p[1][0],p[2][1]-p[1][1],x-p[1][0],y-p[1][1]),c=cross(p[0][0]-p[2][0],p[0][1]-p[2][1],x-p[2][0],y-p[2][1]);return (a>1e-10&&b>1e-10&&c>1e-10)||(a<-1e-10&&b<-1e-10&&c<-1e-10);});}
 const output=[],seen=new Set();
 for(const [a,b]of edges){const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),cuts=[0,1];
  for(const [c,d]of edges){const ex=d[0]-c[0],ey=d[1]-c[1],det=cross(dx,dy,ex,ey),rx=c[0]-a[0],ry=c[1]-a[1];if(Math.abs(det)>1e-8){const t=cross(rx,ry,ex,ey)/det,u=cross(rx,ry,dx,dy)/det;if(t>0&&t<1&&u>=-1e-6&&u<=1+1e-6)cuts.push(t);}else if(Math.abs(cross(rx,ry,dx,dy))<1e-6){for(const p of[c,d]){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(len*len);if(t>0&&t<1)cuts.push(t);}}}
  cuts.sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){let from=cuts[i-1],to=cuts[i];if((to-from)*len<1e-5)continue;let t=(from+to)/2,x=a[0]+dx*t,y=a[1]+dy*t,nx=-dy/len*1e-4,ny=dx/len*1e-4;if(inside(x+nx,y+ny)===inside(x-nx,y-ny))continue;let p=[a[0]+dx*from,a[1]+dy*from],q=[a[0]+dx*to,a[1]+dy*to],k=[p,q].map(v=>v.map(n=>n.toFixed(5)).join(',')).sort().join('|');if(seen.has(k))continue;seen.add(k);output.push([p,q]);}
 }
 return output;
}

async function buildField() {
  const mark=await loadMark(), triangles=[], seen=new Set();
  try {
    mark.updateMatrixWorld(true);
    mark.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const {geometry,matrixWorld}=mesh, pos=geometry.attributes.position, index=geometry.index, e=matrixWorld.elements;
      const points=new Float32Array(pos.count*2);
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        points[i*2]=e[0]*x+e[4]*y+e[8]*z+e[12];
        points[i*2+1]=-(e[1]*x+e[5]*y+e[9]*z+e[13]);
      }
      for(let i=0;i<(index?.count??pos.count);i+=3){
        const p=[0,1,2].map(j=>{const k=(index?index.getX(i+j):i+j)*2;return [points[k],points[k+1]];});
        const area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
        if(Math.abs(area)<1e-7)continue;
        const key=p.map(v=>v.map(n=>n.toFixed(6)).join(',')).sort().join('|');
        if(!seen.has(key)){seen.add(key);triangles.push(p);}
      }
    });
  } finally {
    mark.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.geometry.dispose();
      if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());
      else mesh.material?.dispose();
    });
  }
  const edges=outlineBoundary(triangles).map(([a,b])=>{
    const dx=b[0]-a[0],dy=b[1]-a[1];return {x:a[0],y:a[1],dx,dy,length2:dx*dx+dy*dy};
  });
  const distance=new Float32Array(NX*NY);
  distance.bounds=[Math.min(...edges.map(e=>Math.min(e.x,e.x+e.dx))),Math.max(...edges.map(e=>Math.max(e.x,e.x+e.dx))),Math.min(...edges.map(e=>Math.min(e.y,e.y+e.dy))),Math.max(...edges.map(e=>Math.max(e.y,e.y+e.dy)))];
  // Interpolate signed distance to the exact GLB union, not a stair-stepped
  // binary mask. Straight sloping edges then remain straight between samples.
  for(let iy=0;iy<NY;iy++)for(let ix=0;ix<NX;ix++){
    const x=ix*DX-FIELD_X,y=iy*DY-FIELD_Y;
    let inside=false,nearest=BEVEL*BEVEL;
    for(const edge of edges){
      const px=x-edge.x,py=y-edge.y,t=clamp((px*edge.dx+py*edge.dy)/edge.length2,0,1);
      const ux=px-t*edge.dx,uy=py-t*edge.dy;
      nearest=Math.min(nearest,ux*ux+uy*uy);
      if((edge.y>y)!==(edge.y+edge.dy>y)&&x<edge.x+edge.dx*(y-edge.y)/edge.dy)inside=!inside;
    }
    distance[iy*NX+ix]=(inside?1:-1)*Math.sqrt(nearest);
  }
  return distance;
}

function sample(height, x, y) {
  if (x<=-FIELD_X || x>=FIELD_X || y<=-FIELD_Y || y>=FIELD_Y) return 0;
  const gx=(x+FIELD_X)/DX, gy=(y+FIELD_Y)/DY;
  const ix=Math.min(gx|0,NX-2), iy=Math.min(gy|0,NY-2), fx=gx-ix, fy=gy-iy;
  const i=iy*NX+ix;
  const a=height[i] + (height[i+1]-height[i])*fx;
  const b=height[i+NX] + (height[i+NX+1]-height[i+NX])*fx;
  const d=clamp((a+(b-a)*fy)/BEVEL,0,1);
  // C2 contact with the plane and flat crown removes hard slope kinks while
  // retaining the original angular footprint and a genuinely level top.
  return RISE*d*d*d*(d*(d*6-15)+10);
}

function hiddenByRelief(height,x,y,z,lift,c=C,s=S,flatten=FLATTEN) {
  // Orthographic viewing rays keep screen x constant. If a nearer point
  // rises above this screen y, the blue surface covers this bit of line.
  const reach=(RISE-z)*lift/flatten;
  if (reach<OCCLUSION_STEP || Math.abs(x)>FIELD_X+.17 || Math.abs(y)>FIELD_Y+.34) return false;
  const [left,right,top,bottom]=height.bounds, endX=x-s*reach,endY=y+c*reach;
  if(Math.max(x,endX)<left||Math.min(x,endX)>right||Math.max(y,endY)<top||Math.min(y,endY)>bottom)return false;
  for (let d=OCCLUSION_STEP;d<reach;d+=OCCLUSION_STEP) {
    if ((sample(height,x-s*d,y+c*d)-z)*lift>flatten*d+.005) return true;
  }
  return false;
}

export async function createContourHero({el,signal,reduced,theme='light'}) {
  const field=await getField();
  if (signal?.aborted) return {frame(){},resize(){},dispose(){}};
  const dark=theme==='dark';
  const palette=dark ? {
    plane:'#95baff', major:'#a6ceff', relief:'#daefff', edge:'#93d6ff', crest:'#f0faff',
    halo:'rgba(59,106,255,.40)', pool:'rgba(82,169,255,.15)', grain:'#b8d9ff',
    planeAlpha:.30, surfaceAlpha:.56, glow:'rgba(139,205,255,0)',
    cursor:'#e5f7ff'
  } : {
    plane:'#526b9e', major:'#274b94', relief:'#143dc8', edge:'#387be6', crest:'#2465ff',
    halo:'rgba(183,215,249,.36)', pool:'rgba(151,193,255,.16)', grain:'#3b527b',
    planeAlpha:.23, surfaceAlpha:.84, glow:'rgba(78,139,255,0)',
    cursor:'#2859e5'
  };
  const canvas=document.createElement('canvas'), atmosphere=document.createElement('canvas');
  const g=canvas.getContext('2d',{alpha:true}), bg=atmosphere.getContext('2d',{alpha:true});
  if (!g || !bg) throw new Error('Canvas 2D is unavailable');
  canvas.setAttribute('aria-label','Волны огибают рельеф монограммы. Касание посылает импульс, движение меняет ракурс.');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  el.append(canvas);
  let w=1,h=1,dpr=1,scale=1,ox=.5,oy=.5,spacing=.17,fade;
  let mx=0,my=0,last=-1,disposed=false;
  let pressTime=-10, pressU=0,pressV=0;
  let viewC=C,viewS=S,flatten=FLATTEN,surfaceLight=palette.relief;
  const u=new Float32Array(8193), v=new Float32Array(8193), kinds=new Uint8Array(8193);

  function resize(width,height) {
    if (disposed) return;
    w=Math.max(1,width); h=Math.max(1,height);
    dpr=Math.min(window.devicePixelRatio||1,1.85,1160/w,850/h);
    canvas.width=atmosphere.width=Math.max(1,Math.round(w*dpr));
    canvas.height=atmosphere.height=Math.max(1,Math.round(h*dpr));
    // Fit the same physical field continuously from a phone to a wide hero.
    scale=Math.min(w/6.92,h/4.55);
    ox=w*.5; oy=h*.48;
    spacing=adaptiveRingSpacing(w,h)/scale;
    bg.setTransform(dpr,0,0,dpr,0,0);
    const center=bg.createRadialGradient(w*.45,h*.46,0,w*.45,h*.46,Math.max(w,h)*.57);
    center.addColorStop(0,palette.halo);
    center.addColorStop(.56,dark?'rgba(43,85,235,.14)':'rgba(204,223,245,.09)');
    center.addColorStop(1,'rgba(120,170,230,0)');
    bg.fillStyle=center; bg.fillRect(0,0,w,h);
    const pool=bg.createRadialGradient(w*.61,h*.69,0,w*.61,h*.69,Math.min(w,h)*.43);
    pool.addColorStop(0,palette.pool);
    pool.addColorStop(1,'rgba(100,160,240,0)');
    bg.fillStyle=pool; bg.fillRect(0,0,w,h);
    // Fixed, restrained paper grain: no random flicker or full-screen noise.
    let seed=2383;
    function rand() { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
    const grains=Math.min(15000,Math.ceil(w*h*.064));
    bg.fillStyle=palette.grain;
    for (let i=0;i<grains;i++) {
      const gx=rand()*w, gy=rand()*h;
      bg.globalAlpha=.009+rand()*(dark?.037:.026);
      bg.fillRect(gx,gy,.64,.64);
    }
    bg.globalAlpha=1;
    g.setTransform(dpr,0,0,dpr,0,0);
    fade=g.createLinearGradient(0,0,0,h);
    fade.addColorStop(0,'rgba(0,0,0,0)');
    fade.addColorStop(.08,'rgba(0,0,0,.30)');
    fade.addColorStop(.23,'#000');
    fade.addColorStop(.77,'#000');
    fade.addColorStop(.94,'rgba(0,0,0,.27)');
    fade.addColorStop(1,'rgba(0,0,0,0)');
    last=-1;
  }

  // All colour and light live on contour lines. The sign has no filled face:
  // its silhouette is revealed by the bends, occlusion and line density.
  function trace(cx,cy,radius,lift,raisedAlpha=0,edgeAlpha=0) {
    let n=0, raisedCount=0;
    function point(x,y,z){
      if(n>=u.length)return;
      u[n]=ox+scale*(viewC*x+viewS*y);
      v[n]=oy+scale*(flatten*(-viewS*x+viewC*y)-lift*z);
      kinds[n]=hiddenByRelief(field,x,y,z,lift,viewC,viewS,flatten) ? 0 : (z>.11 ? 2 : z>.026 ? 3 : 1);
      if(kinds[n]===2)raisedCount++;
      n++;
    }
    function segment(a0,a1,x0,y0,z0,x1,y1,z1,depth){
      const near=Math.min(x0,x1)<FIELD_X+.04&&Math.max(x0,x1)>-FIELD_X-.04&&Math.min(y0,y1)<FIELD_Y+.04&&Math.max(y0,y1)>-FIELD_Y-.04;
      if(near&&depth<4){
        const am=(a0+a1)*.5,xm=cx+radius*Math.cos(am),ym=cy+radius*Math.sin(am),zm=sample(field,xm,ym);
        const bend=Math.abs(zm-(z0+z1)*.5)*scale*lift;
        const slope=(z0>0&&z0<RISE)||(zm>0&&zm<RISE)||(z1>0&&z1<RISE);
        // Spend vertices on the ridge, in CSS pixels; flat outer arcs remain cheap.
        if(bend>.18||Math.abs(z1-z0)*scale*lift>2||(slope&&(a1-a0)*radius*scale>1.3)){
          segment(a0,am,x0,y0,z0,xm,ym,zm,depth+1);
          segment(am,a1,xm,ym,zm,x1,y1,z1,depth+1);return;
        }
      }
      point(x1,y1,z1);
    }
    let j=0,x0=cx+radius,y0=cy,z0=sample(field,x0,y0);point(x0,y0,z0);
    while(j<STEPS){
      const stride=Math.abs(x0)>FIELD_X+.38||Math.abs(y0)>FIELD_Y+.38||radius<1.24?3:1;
      const next=Math.min(STEPS,j+stride),x1=cx+radius*COS[next],y1=cy+radius*SIN[next],z1=sample(field,x1,y1);
      segment(j*TAU/STEPS,next*TAU/STEPS,x0,y0,z0,x1,y1,z1,0);
      j=next;x0=x1;y0=y1;z0=z1;
    }
    const path=kind=>{
      g.beginPath();
      let open=false;
      for (let i=0;i<n;i++) {
        if (!kinds[i] || (kind && kinds[i]!==kind)) {open=false;continue;}
        if (open) g.lineTo(u[i],v[i]); else g.moveTo(u[i],v[i]);
        open=true;
      }
      g.stroke();
    };
    path(0);
    if (raisedAlpha>.01 && raisedCount>1) {
      g.globalAlpha=raisedAlpha;
      g.strokeStyle=surfaceLight; g.lineWidth=dark?.83:.93;
      path(2);
    }
    if (edgeAlpha>.01) {
      g.globalAlpha=edgeAlpha;
      g.strokeStyle=palette.edge; g.lineWidth=.9;
      path(3);
    }
  }

  function frame(t,dt,input={}) {
    if (disposed) return;
    if (last>=0 && t<last) {mx=my=0;pressTime=-10;}
    if (!reduced && input.pressed) {
      const px=clamp(input.pressX??input.x??0,-1,1), py=clamp(input.pressY??input.y??0,-1,1);
      const ux=((px+1)*w*.5-ox)/scale, vy=((py+1)*h*.5-oy)/(scale*flatten);
      pressU=viewC*ux-viewS*vy; pressV=viewS*ux+viewC*vy;
      pressTime=t;
    }
    if (t===last || (last>=0 && t>last && t-last<.024 && pressTime!==t)) return;
    if (reduced && last>=0) return;
    const elapsed=last>=0 && t>last ? t-last : Math.max(0,dt||0);
    last=t;
    const interactive=!reduced && (input.active||input.dragging);
    const follow=1-Math.exp(-4.3*Math.min(.075,elapsed));
    mx+=((interactive ? clamp(input.x||0,-1,1) : 0)-mx)*follow;
    my+=((interactive ? clamp(input.y||0,-1,1) : 0)-my)*follow;
    const clock=reduced ? 2 : t;
    const angle=ANGLE+mx*.10+(reduced?0:Math.sin(clock*.21)*.018);
    viewC=Math.cos(angle);viewS=Math.sin(angle);
    flatten=.69+my*.055;
    const age=t-pressTime;
    const beat=(clock+.34)%3.8;
    const heartbeat=reduced?0:.11*Math.exp(-Math.pow((beat-.27)/.12,2))+.067*Math.exp(-Math.pow((beat-.55)/.16,2));
    const pressure=!reduced && age>=0 && age<1.8 ? .26*Math.sin(Math.min(1,age/.32)*Math.PI*.5)*Math.exp(-age*2.6) : 0;
    const buildup=reduced ? 1 : .31+.69*smooth((clock-.06)/1.12);
    const lift=(LIFT+.20+heartbeat+pressure)*buildup;
    const shift=clock*.70+.39, index=Math.floor(shift), offset=shift-index;
    const crest=(clock*1.68+2.15)%9.8;
    const cx=-.90+mx*.34, cy=2.94+my*.25;
    const centerX=ox+scale*(viewC*cx+viewS*cy);
    const centerY=oy+scale*flatten*(-viewS*cx+viewC*cy);
    const far=Math.hypot(Math.max(Math.abs(centerX),Math.abs(w-centerX))/scale,Math.max(Math.abs(centerY),Math.abs(h-centerY))/(scale*flatten));
    const ringCount=Math.ceil((far+.28)/spacing);
    g.setTransform(1,0,0,1,0,0);
    g.globalAlpha=1;
    g.clearRect(0,0,canvas.width,canvas.height); g.drawImage(atmosphere,0,0);
    g.setTransform(dpr,0,0,dpr,0,0);
    g.lineJoin='round'; g.lineCap='round';
    // A broad moving studio reflection crosses the contour tops. It is tied
    // to the pointer too, so a drag feels like turning a physical specimen.
    const shine=.49+Math.sin(clock*.45)*.17+mx*.10;
    surfaceLight=g.createLinearGradient(ox-scale*3.1,oy-scale*.4,ox+scale*3.1,oy+scale*.4);
    surfaceLight.addColorStop(0,dark?'#8ab7ff':'#143dc8');
    surfaceLight.addColorStop(Math.max(.04,shine-.22),dark?'#c1dcff':'#2546bf');
    surfaceLight.addColorStop(shine,dark?'#f4fdff':'#1b85e8');
    surfaceLight.addColorStop(Math.min(.96,shine+.22),dark?'#add9ff':'#153cb7');
    surfaceLight.addColorStop(1,dark?'#78baff':'#25398f');
    for (let i=0;i<=ringCount;i++) {
      const radius=(i+offset)*spacing;
      const swell=smooth(1-Math.abs(radius-crest)/.59);
      const glimmer=smooth(1-Math.abs(radius-crest+.79)/.39);
      const rank=((i-index)%6+6)%6;
      const base=palette.planeAlpha+(rank===0?.12:rank===3?.05:0);
      g.strokeStyle=swell>.45 ? palette.crest : rank===0 ? palette.major : palette.plane;
      g.lineWidth=.62+.29*swell+(rank===0?.09:0);
      g.globalAlpha=base+(dark?.37:.29)*swell+.07*glimmer;
      trace(cx,cy,radius,lift,palette.surfaceAlpha+(dark?.30:.12)*swell,.36+.36*swell);
    }
    if (!reduced && age>=0 && age<1.75) {
      const radius=.06+age*(4.75-.70*age);
      const envelope=smooth(age/.07)*(1-smooth((age-.18)/1.57));
      g.strokeStyle=palette.crest;g.lineWidth=1.35;g.globalAlpha=.89*envelope;
      trace(pressU,pressV,radius,lift);
      if (age>.10) {
        g.strokeStyle=palette.edge;g.lineWidth=.82;g.globalAlpha=.48*envelope*smooth((age-.10)/.16);
        trace(pressU,pressV,Math.max(.02,radius-.42),lift);
      }
      // A short inner ring supplies immediate feedback before the large wave.
      if (age<.52) {
        g.strokeStyle=palette.cursor;g.lineWidth=.87;g.globalAlpha=.7*(1-smooth(age/.52));
        trace(pressU,pressV,.04+age*.46,lift);
      }
    }
    g.globalAlpha=1;
    g.globalCompositeOperation='destination-in';
    g.fillStyle=fade; g.fillRect(0,0,w,h);
    g.globalCompositeOperation='source-over';
  }

  function dispose() {
    if (disposed) return;
    disposed=true;
    signal?.removeEventListener('abort',dispose);
    canvas.remove();
    canvas.width=canvas.height=atmosphere.width=atmosphere.height=1;
  }
  signal?.addEventListener('abort',dispose,{once:true});
  resize(el.clientWidth,el.clientHeight); frame(0,0);
  return {frame,resize,dispose};
}
