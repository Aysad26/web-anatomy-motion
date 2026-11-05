import {getGradientOutline} from './contour-gradient.js';
import {adaptiveRingSpacing} from './ring-density.js';

const TAU=2*Math.PI, ANGLE=.25;
const C=Math.cos(ANGLE), S=Math.sin(ANGLE);
const FLATTEN=.72, LIFT=.94;
const FIELD_X=3.08, FIELD_Y=2.31, NX=769, NY=577;
const DX=2*FIELD_X/(NX-1), DY=2*FIELD_Y/(NY-1);
const RISE=.40, BEVEL=.112, OCCLUSION_STEP=.024;
const PERIOD=8.6, RING_CYCLES=6;
const STEPS=512, COS=new Float32Array(STEPS+1), SIN=new Float32Array(STEPS+1);
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

async function buildField() {
  const outline=await getGradientOutline();
  const edges=outline.map(([[ax,ay],[bx,by]])=>{
    const vx=bx-ax,vy=by-ay;
    return {ax,ay,bx,by,vx,vy,inv:1/(vx*vx+vy*vy),
      left:Math.min(ax,bx)-BEVEL,right:Math.max(ax,bx)+BEVEL,
      top:Math.min(ay,by)-BEVEL,bottom:Math.max(ay,by)+BEVEL};
  });
  const height=new Float32Array(NX*NY),crossings=[];
  // An exact GLB union boundary supplies Euclidean distance, not distances
  // propagated over a binary grid. A rounded shoulder reaches the flat top
  // with zero slope at both ends, so the printed rings do not acquire teeth.
  for(let iy=1;iy<NY-1;iy++){
    const y=iy*DY-FIELD_Y;
    crossings.length=0;
    for(const edge of edges)if((edge.ay>y)!==(edge.by>y)){
      crossings.push(edge.ax+(y-edge.ay)*edge.vx/edge.vy);
    }
    crossings.sort((a,b)=>a-b);
    for(let k=0;k+1<crossings.length;k+=2){
      const lo=Math.max(1,Math.ceil((crossings[k]+FIELD_X)/DX));
      const hi=Math.min(NX-2,Math.floor((crossings[k+1]+FIELD_X)/DX));
      for(let ix=lo;ix<=hi;ix++){
        const x=ix*DX-FIELD_X;
        let nearest=BEVEL*BEVEL;
        for(const edge of edges){
          if(x<edge.left||x>edge.right||y<edge.top||y>edge.bottom)continue;
          const dx=x-edge.ax,dy=y-edge.ay,t=clamp((dx*edge.vx+dy*edge.vy)*edge.inv,0,1);
          const u=dx-t*edge.vx,v=dy-t*edge.vy;
          nearest=Math.min(nearest,u*u+v*v);
        }
        height[iy*NX+ix]=RISE*smooth(Math.sqrt(nearest)/BEVEL);
      }
    }
  }
  return height;
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

function hiddenByRelief(height,x,y,z,lift,c=C,s=S,flatten=FLATTEN) {
  // Orthographic viewing rays keep screen x constant. If a nearer point
  // rises above this screen y, the solid relief hides this rear portion of the contour.
  const reach=(RISE-z)*lift/flatten;
  if (reach<OCCLUSION_STEP || Math.abs(x)>FIELD_X+.17 || Math.abs(y)>FIELD_Y+.34) return false;
  for (let d=OCCLUSION_STEP;d<reach;d+=OCCLUSION_STEP) {
    if ((sample(height,x-s*d,y+c*d)-z)*lift>flatten*d+.005) return true;
  }
  return false;
}

/** Continuous contour lines over a narrow, physically profiled GLB bevel.
 * The independent gradient backdrop belongs to the page, outside its stage mask.
 */
export async function createBevelGradientContourHero({el,signal,reduced=false,theme='light'}) {
  const field=await getField();
  if(signal?.aborted)throw new DOMException('Scene cancelled','AbortError');
  const dark=theme==='dark';
  const palette=dark ? {
    plane:'#a5c6f5',major:'#c0ddfa',surface:'#d0e9ff',edge:'#b4dfff',crest:'#effaff',cursor:'#f6fcff',
    planeAlpha:.24,surfaceAlpha:.66
  } : {
    plane:'#6482ac',major:'#4a70ae',surface:'#3159a2',edge:'#4778bd',crest:'#3469c9',cursor:'#214baf',
    planeAlpha:.25,surfaceAlpha:.66
  };
  const canvas=document.createElement('canvas'),g=canvas.getContext('2d',{alpha:true});
  if(!g)throw new Error('Canvas 2D unavailable');
  canvas.className='gradient-bevel-canvas';canvas.dataset.renderer='canvas';
  canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',pointerEvents:'none'});
  el.append(canvas);
  let w=1,h=1,dpr=1,scale=1,ox=.5,oy=.5,spacing=.17,fade;
  let mx=0,my=0,last=-1,dirty=true,disposed=false,pressTime=-10,pressU=0,pressV=0;
  let viewC=C,viewS=S,flatten=FLATTEN;
  const u=new Float32Array(4097),v=new Float32Array(4097),levels=new Float32Array(4097);
  const visible=new Uint8Array(4097),shades=new Uint8Array(4097);

  function resize(width,height){
    if(disposed)return;
    w=Math.max(1,Number(width)||1);h=Math.max(1,Number(height)||1);
    dpr=Math.min(globalThis.devicePixelRatio||1,1.85,1280/w,950/h);
    canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
    scale=Math.min(w/7.05,h/4.85);ox=w*.5;oy=h*.49;
    const minimumSpacing=.13-.075*smooth((w-480)/280);
    spacing=Math.max(adaptiveRingSpacing(w,h)/scale,minimumSpacing)*1.35;
    g.setTransform(dpr,0,0,dpr,0,0);
    fade=g.createLinearGradient(0,0,0,h);
    fade.addColorStop(0,'transparent');fade.addColorStop(.09,'#000');
    fade.addColorStop(.88,'#000');fade.addColorStop(1,'transparent');
    dirty=true;
  }

  // Every exposed contour uses the same continuous geometry. A gently
  // increasing ink weight follows the rise rather than cutting each line
  // where its side changes into the top face.
  function trace(cx,cy,radius,lift,surfaceAlpha=0){
    let n=0,raised=0;
    function point(x,y,z){
      if(n>=u.length)return;
      u[n]=ox+scale*(viewC*x+viewS*y);
      v[n]=oy+scale*(flatten*(-viewS*x+viewC*y)-lift*z);
      visible[n]=!hiddenByRelief(field,x,y,z,lift,viewC,viewS,flatten);
      levels[n]=smooth(z/RISE);
      if(visible[n]&&z>.003)raised++;
      n++;
    }
    function segment(a0,a1,x0,y0,z0,x1,y1,z1,depth){
      if(depth<5&&Math.abs(x0+x1)*.5<FIELD_X+.18&&Math.abs(y0+y1)*.5<FIELD_Y+.18){
        const midpoint=sample(field,(x0+x1)*.5,(y0+y1)*.5);
        // Looking at the midpoint also detects a narrow shoulder when both
        // endpoints are level. Subdivision stops at subpixel projection error.
        if(Math.abs(z1-z0)>.023||Math.abs(midpoint-(z0+z1)*.5)*scale*lift>.22){
          const am=(a0+a1)*.5,xm=cx+radius*Math.cos(am),ym=cy+radius*Math.sin(am),zm=sample(field,xm,ym);
          segment(a0,am,x0,y0,z0,xm,ym,zm,depth+1);
          segment(am,a1,xm,ym,zm,x1,y1,z1,depth+1);
          return;
        }
      }
      point(x1,y1,z1);
    }
    let j=0,x0=cx+radius,y0=cy,z0=sample(field,x0,y0);point(x0,y0,z0);
    while(j<STEPS){
      const stride=Math.abs(x0)>FIELD_X+.38||Math.abs(y0)>FIELD_Y+.38||radius<1.1?3:1;
      const next=Math.min(STEPS,j+stride),x1=cx+radius*COS[next],y1=cy+radius*SIN[next],z1=sample(field,x1,y1);
      segment(j*TAU/STEPS,next*TAU/STEPS,x0,y0,z0,x1,y1,z1,0);
      j=next;x0=x1;y0=y1;z0=z1;
    }
    g.beginPath();
    for(let i=0;i<n;i++){
      if(!visible[i])continue;
      if(i&&visible[i-1])g.lineTo(u[i],v[i]);else g.moveTo(u[i],v[i]);
    }
    g.stroke();
    if(surfaceAlpha<=.01||raised<2)return;
    let strongest=0;
    for(let i=1;i<n;i++){
      shades[i]=visible[i-1]&&visible[i]?Math.round((levels[i-1]+levels[i])*2.5):0;
      strongest=Math.max(strongest,shades[i]);
    }
    const originalCap=g.lineCap;
    g.lineCap='butt';g.strokeStyle=palette.surface;g.lineWidth=.80;
    for(let ink=1;ink<=strongest;ink++){
      g.beginPath();let open=false,any=false;
      for(let i=1;i<n;i++){
        if(shades[i]!==ink){
          open=false;continue;
        }
        if(!open)g.moveTo(u[i-1],v[i-1]);
        g.lineTo(u[i],v[i]);open=any=true;
      }
      if(any){g.globalAlpha=surfaceAlpha*ink/5;g.stroke();}
    }
    g.lineCap=originalCap;
  }

  function frame(time,dt=0,input={}){
    if(disposed)return;
    const t=reduced?2.05:Math.max(0,Number(time)||0);
    if(last>=0&&t<last){mx=my=0;pressTime=-10;dirty=true;}
    if(reduced&&!dirty)return;
    if(!dirty&&t===last)return;
    if(!dirty&&last>=0&&t-last<.027&&!input.pressed)return;
    const elapsed=last>=0?Math.max(0,t-last):Math.max(0,dt),follow=1-Math.exp(-4.3*Math.min(.075,elapsed));
    const active=!reduced&&(input.active||input.dragging);
    mx+=((active?clamp(Number(input.x)||0,-1,1):0)-mx)*follow;
    my+=((active?clamp(Number(input.y)||0,-1,1):0)-my)*follow;
    const angle=ANGLE+mx*.075;
    viewC=Math.cos(angle);viewS=Math.sin(angle);flatten=FLATTEN+my*.04;
    if(!reduced&&input.pressed){
      const ux=((clamp(input.pressX??input.x??0,-1,1)+1)*w*.5-ox)/scale;
      const vy=((clamp(input.pressY??input.y??0,-1,1)+1)*h*.5-oy)/(scale*flatten);
      pressU=viewC*ux-viewS*vy;pressV=viewS*ux+viewC*vy;pressTime=t;
    }
    const age=t-pressTime,lift=LIFT;
    const shift=(t+2.18)*RING_CYCLES/PERIOD,index=Math.floor(shift),offset=shift-index;
    const cx=-.86+mx*.3,cy=2.96+my*.22;
    const centerX=ox+scale*(viewC*cx+viewS*cy),centerY=oy+scale*flatten*(-viewS*cx+viewC*cy);
    const far=Math.hypot(Math.max(Math.abs(centerX),Math.abs(w-centerX))/scale,Math.max(Math.abs(centerY),Math.abs(h-centerY))/(scale*flatten));
    const ringCount=Math.ceil((far+.28)/spacing);
    const crest=((t+1.35)*1.35)%10.2;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);
    g.setTransform(dpr,0,0,dpr,0,0);g.globalCompositeOperation='source-over';g.lineJoin='round';g.lineCap='round';
    for(let i=0;i<=ringCount;i++){
      const radius=(i+offset)*spacing,swell=smooth(1-Math.abs(radius-crest)/.48);
      const major=((i-index)%6+6)%6===0;
      g.strokeStyle=swell>.5?palette.crest:major?palette.major:palette.plane;
      g.lineWidth=.60+.18*swell+(major?.07:0);
      g.globalAlpha=palette.planeAlpha+(major?.045:0)+.15*swell;
      trace(cx,cy,radius,lift,palette.surfaceAlpha+.15*swell);
    }
    if(!reduced&&age>=0&&age<2.35){
      const radius=.045+age*(3.7-.30*age);
      const envelope=smooth(age/.055)*(1-smooth((age-.24)/2.11));
      g.strokeStyle=palette.crest;g.lineWidth=1.3;g.globalAlpha=.94*envelope;
      trace(pressU,pressV,radius,lift);
      if(age>.12){
        g.strokeStyle=palette.edge;g.lineWidth=.83;g.globalAlpha=.57*envelope*smooth((age-.12)/.20);
        trace(pressU,pressV,Math.max(.015,radius-.36),lift);
      }
      if(age<.48){g.strokeStyle=palette.cursor;g.lineWidth=1;g.globalAlpha=.8*(1-smooth(age/.48));trace(pressU,pressV,.035+age*.48,lift);}
    }
    g.globalAlpha=1;g.globalCompositeOperation='destination-in';g.fillStyle=fade;g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over';
    canvas.dataset.phase=(((t+2.18)%PERIOD)/PERIOD).toFixed(3);
    last=t;dirty=false;
  }

  function dispose(){
    if(disposed)return;disposed=true;signal?.removeEventListener('abort',dispose);canvas.remove();canvas.width=canvas.height=1;
  }
  signal?.addEventListener('abort',dispose,{once:true});
  const box=el.getBoundingClientRect();resize(box.width,box.height);
  return {frame,resize,dispose};
}
