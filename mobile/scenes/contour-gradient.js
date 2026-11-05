import * as THREE from 'three';
import {loadMark} from '../../mark-kit.js';
import {adaptiveRingSpacing} from './ring-density.js';

// Transparent contours define the prism; its colour backdrop is a separate DOM layer.
// Each projected source triangle becomes a flat-topped prism. Their opaque union
// preserves the exact GLB footprint without a height texture or a bevel.
const RISE=.50, LIFT=.94, PERIOD=8.6, PHASE_OFFSET=2.18;
const RING_SPACING=1.35, RING_WIDTH=.65, RING_CYCLES=6;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const x=clamp(v);return x*x*(3-2*x);};
let shapePromise;

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

async function buildShape(){
  const mark=await loadMark(),projected=[],seen=new Set();
  try{
    mark.updateMatrixWorld(true);
    mark.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const {geometry,matrixWorld}=mesh,pos=geometry.attributes.position,index=geometry.index,e=matrixWorld.elements;
      const points=new Float32Array(pos.count*2);
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
        points[i*2]=e[0]*x+e[4]*y+e[8]*z+e[12];
        points[i*2+1]=-(e[1]*x+e[5]*y+e[9]*z+e[13]);
      }
      for(let i=0;i<(index?.count??pos.count);i+=3){
        const ids=[0,1,2].map(j=>(index?index.getX(i+j):i+j)*2);
        const p=ids.map(j=>[points[j],points[j+1]]);
        const area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);
        if(Math.abs(area)<1e-7)continue;
        const key=p.map(v=>v.map(n=>n.toFixed(6)).join(',')).sort().join('|');
        if(seen.has(key))continue;
        seen.add(key);projected.push(p);
      }
    });
  }finally{
    mark.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();[].concat(mesh.material).forEach(m=>m.dispose());}});
  }
  const vertices=[];
  const triangle=(a,b,c)=>vertices.push(...a,...b,...c);
  for(const p of projected){
    const bottom=p.map(v=>[...v,0]),top=p.map(v=>[...v,RISE]);
    triangle(...top);
    for(let i=0;i<3;i++){
      const j=(i+1)%3;
      triangle(bottom[i],bottom[j],top[j]);triangle(bottom[i],top[j],top[i]);
    }
  }
  return {vertices:new Float32Array(vertices),rim:outlineBoundary(projected)};
}
function getShape(){return shapePromise??=(buildShape().catch(error=>{shapePromise=undefined;throw error;}));}
export async function getGradientOutline(){return (await getShape()).rim;}

const VERTEX=`
varying vec3 vSurface;
varying vec2 vScreen;
uniform vec2 uSize,uCenter;
uniform float uScale,uAngle,uFlatten;
void main(){
  vSurface=position;
  float c=cos(uAngle),s=sin(uAngle);
  vec2 q=vec2(c*position.x+s*position.y,uFlatten*(-s*position.x+c*position.y)-position.z*.94);
  vec2 pixel=uCenter+q*uScale;
  vScreen=pixel/uSize;
  gl_Position=vec4(pixel.x/uSize.x*2.-1.,1.-pixel.y/uSize.y*2.,-position.z/.50*.8,1.);
}`;
const FRAGMENT=`
precision highp float;
varying vec3 vSurface;
varying vec2 vScreen;
uniform vec2 uSource,uTap;
uniform float uTime,uTapAge,uDark,uSpacing,uPixelRatio;
float soft(float x){x=clamp(x,0.,1.);return x*x*(3.-2.*x);}
void main(){
  float phase=mod(uTime+2.18,8.6)/8.6;
  // The transparent contour layer has its own 3D coordinates and visibility.
  // Round the contour phase at the two seams without rounding the geometry.
  float z=clamp(vSurface.z/.50,0.,1.);
  float raised=soft(z);
  float heightPhase=.975*(.22*z+.78*raised);
  float distanceOnSurface=length(vSurface.xy-uSource)+heightPhase;
  float ringCoordinate=distanceOnSurface/uSpacing-phase*6.;
  float tapWave=0.;
  if(uTapAge>=0.&&uTapAge<2.6){
    float age=uTapAge/2.6;
    float tapDistance=length(vSurface.xy-uTap)+heightPhase;
    float wave=(tapDistance-(.05+uTapAge*2.2))/.38;
    tapWave=exp(-wave*wave)*pow(sin(age*3.14159265),2.)*.45;
    ringCoordinate-=tapWave;
  }
  float ringDistance=abs(fract(ringCoordinate+.5)-.5);
  vec2 derivative=vec2(dFdx(ringCoordinate),dFdy(ringCoordinate));
  float footprint=max(abs(derivative.x)+abs(derivative.y),.0001);
  float wall=soft(z/.19)*soft((1.-z)/.19);
  float halfWidth=length(derivative)*uPixelRatio*(.325+raised*.06+wall*.035);
  float line=clamp((halfWidth+footprint*.5-ringDistance)/footprint,0.,1.);
  // A fixed edge fade belongs only to the contours, independently of the oval.
  float edge=soft(min(vScreen.x,1.-vScreen.x)/.07)*soft(min(vScreen.y,1.-vScreen.y)/.08);
  vec3 ink=mix(vec3(.18,.34,.60),vec3(.82,.93,1.),uDark);
  float opacity=mix(mix(.18,.24,uDark),mix(.46,.60,uDark),raised)+wall*.07+tapWave*.12;
  float alpha=line*opacity*edge;
  // Premultiplied output lets genuinely transparent gaps reveal the DOM backdrop.
  gl_FragColor=vec4(ink*alpha,alpha);
}`;

function createGPU(canvas,shape,dark){
  const context=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:true,powerPreference:'low-power'});
  if(!context)throw new Error('WebGL2 unavailable');
  const renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,premultipliedAlpha:true,antialias:true});
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const uniforms={uSize:{value:new THREE.Vector2()},uCenter:{value:new THREE.Vector2()},uSource:{value:new THREE.Vector2()},uTap:{value:new THREE.Vector2()},uScale:{value:1},uAngle:{value:.32},uFlatten:{value:.62},uTime:{value:0},uTapAge:{value:-1},uDark:{value:dark?1:0},uSpacing:{value:.16},uPixelRatio:{value:1}};
  const material=new THREE.ShaderMaterial({uniforms,toneMapped:false,depthTest:true,depthWrite:true,side:THREE.DoubleSide,vertexShader:VERTEX,fragmentShader:FRAGMENT});
  // The plane and prism carry contours; their transparent gaps share the flat backdrop.
  const plane=new Float32Array([-100,-100,0,100,-100,0,100,100,0,-100,-100,0,100,100,0,-100,100,0]);
  const all=new Float32Array(plane.length+shape.vertices.length);all.set(plane);all.set(shape.vertices,plane.length);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(all,3));
  const scene=new THREE.Scene(),camera=new THREE.Camera(),mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;scene.add(mesh);
  const rimPoints=[];for(const segment of shape.rim)for(const p of segment)rimPoints.push(p[0],p[1],RISE+.0001);
  const rimGeometry=new THREE.BufferGeometry();rimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rimPoints,3));
  const rimMaterial=new THREE.ShaderMaterial({uniforms,toneMapped:false,transparent:true,premultipliedAlpha:true,depthTest:true,depthWrite:false,vertexShader:VERTEX,fragmentShader:`
    uniform float uDark;
    void main(){float alpha=mix(.32,.46,uDark);vec3 ink=mix(vec3(.18,.34,.60),vec3(.82,.93,1.),uDark);gl_FragColor=vec4(ink*alpha,alpha);}`});
  const rim=new THREE.LineSegments(rimGeometry,rimMaterial);rim.frustumCulled=false;rim.renderOrder=1;scene.add(rim);
  return {
    resize(w,h){renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.7,1500/w,1000/h));renderer.setSize(w,h,false);uniforms.uSize.value.set(w,h);uniforms.uPixelRatio.value=renderer.getPixelRatio();},
    draw(state){
      uniforms.uCenter.value.set(state.ox,state.oy);uniforms.uScale.value=state.scale;
      uniforms.uAngle.value=state.angle;uniforms.uFlatten.value=state.flatten;
      uniforms.uSource.value.set(state.sx,state.sy);uniforms.uTap.value.set(state.tx,state.ty);
      uniforms.uTime.value=state.t;uniforms.uTapAge.value=state.age;uniforms.uSpacing.value=state.spacing;
      renderer.render(scene,camera);
    },
    dispose(){geometry.dispose();material.dispose();rimGeometry.dispose();rimMaterial.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}

function createCanvas(canvas,data,dark){
  const {vertices:shape,rim}=data;
  const g=canvas.getContext('2d',{alpha:true});if(!g)throw new Error('Canvas unavailable');
  let width=1,height=1,w=1,h=1,buffer,positions,derivatives,edgeFade,angle=Infinity,flatten=Infinity,scale=0;
  const projected=new Float32Array(shape.length);
  const ink=(dark?[.82,.93,1]:[.18,.34,.60]).map(value=>Math.round(255*value));
  function resize(ww,hh){
    w=ww;h=hh;
    const factor=Math.min(1.25,Math.sqrt(185000/(w*h)));
    width=Math.max(1,Math.round(w*factor));height=Math.max(1,Math.round(h*factor));
    canvas.width=width;canvas.height=height;buffer=g.createImageData(width,height);
    positions=new Float32Array(width*height*3);derivatives=new Float32Array(width*height*6);
    edgeFade=new Float32Array(width*height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const u=(x+.5)/width,v=(y+.5)/height;
      const i=y*width+x,k=i*4;
      edgeFade[i]=smooth(Math.min(u,1-u)/.07)*smooth(Math.min(v,1-v)/.08);
      buffer.data[k]=ink[0];buffer.data[k+1]=ink[1];buffer.data[k+2]=ink[2];
    }
    angle=Infinity;
  }
  function raster(state){
    const c=Math.cos(state.angle),s=Math.sin(state.angle),xScale=width/w,yScale=height/h;
    for(let iy=0;iy<height;iy++)for(let ix=0;ix<width;ix++){
      const i=(iy*width+ix)*3,qx=((ix+.5)/width*w-state.ox)/state.scale,qy=((iy+.5)/height*h-state.oy)/(state.scale*state.flatten);
      positions[i]=c*qx-s*qy;positions[i+1]=s*qx+c*qy;positions[i+2]=0;
      const k=i*2;
      derivatives[k]=c/(state.scale*xScale);derivatives[k+1]=s/(state.scale*xScale);derivatives[k+2]=0;
      derivatives[k+3]=-s/(state.scale*state.flatten*yScale);derivatives[k+4]=c/(state.scale*state.flatten*yScale);derivatives[k+5]=0;
    }
    for(let i=0;i<shape.length;i+=3){
      projected[i]=(state.ox+(c*shape[i]+s*shape[i+1])*state.scale)*xScale;
      projected[i+1]=(state.oy+(state.flatten*(-s*shape[i]+c*shape[i+1])-shape[i+2]*LIFT)*state.scale)*yScale;
      projected[i+2]=shape[i+2];
    }
    // Affine rasterisation of the exact same prism triangles as WebGL.
    for(let j=0;j<shape.length;j+=9){
      const ax=projected[j],ay=projected[j+1],bx=projected[j+3],by=projected[j+4],cx=projected[j+6],cy=projected[j+7];
      const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(Math.abs(area)<1e-8)continue;
      const left=Math.max(0,Math.floor(Math.min(ax,bx,cx))),right=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
      const top=Math.max(0,Math.floor(Math.min(ay,by,cy))),bottom=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
      const asx=(by-cy)/area,asy=(cx-bx)/area,bsx=(cy-ay)/area,bsy=(ax-cx)/area;
      const derivative=new Float32Array(6);
      for(let channel=0;channel<3;channel++){
        const a=shape[j+channel]-shape[j+6+channel],b=shape[j+3+channel]-shape[j+6+channel];
        derivative[channel]=a*asx+b*bsx;derivative[channel+3]=a*asy+b*bsy;
      }
      for(let y=top;y<=bottom;y++){
        let a=(left+.5-cx)*asx+(y+.5-cy)*asy,b=(left+.5-cx)*bsx+(y+.5-cy)*bsy;
        for(let x=left;x<=right;x++,a+=asx,b+=bsx){
          if(a<0||b<0||a+b>1)continue;
          const k=(y*width+x)*3,d=1-a-b,z=a*shape[j+2]+b*shape[j+5]+d*shape[j+8];
          if(z<positions[k+2])continue;
          positions[k]=a*shape[j]+b*shape[j+3]+d*shape[j+6];
          positions[k+1]=a*shape[j+1]+b*shape[j+4]+d*shape[j+7];positions[k+2]=z;
          derivatives.set(derivative,k*2);
        }
      }
    }
    angle=state.angle;flatten=state.flatten;scale=state.scale;
  }
  function draw(state){
    if(Math.abs(angle-state.angle)>.009||Math.abs(flatten-state.flatten)>.005||scale!==state.scale)raster(state);
    const phase=((state.t+PHASE_OFFSET)%PERIOD)/PERIOD;
    const tapAge=state.age/2.6,tapOn=tapAge>=0&&tapAge<1,tapRadius=.05+state.age*2.2,tapPower=tapOn?Math.sin(tapAge*Math.PI)**2*.45:0;
    const data=buffer.data;
    const pixelRatio=Math.sqrt(width*height/(w*h));
    for(let i=0,j=0,k=0;i<edgeFade.length;i++,j+=3,k+=4){
      const x=positions[j],y=positions[j+1],z=positions[j+2],dx=x-state.sx,dy=y-state.sy;
      const radialDistance=Math.sqrt(dx*dx+dy*dy),level=clamp(z/RISE),raised=smooth(level);
      const heightPhase=RISE*1.95*(.22*level+.78*raised);
      const heightSlope=1.95*(.22+.78*6*level*(1-level));
      const distance=radialDistance+heightPhase;
      let coordinate=distance/state.spacing-phase*RING_CYCLES,tapWave=0;
      const invRadius=1/Math.max(radialDistance,.0001),d=j*2;
      let ddx=(dx*invRadius*derivatives[d]+dy*invRadius*derivatives[d+1]+heightSlope*derivatives[d+2])/state.spacing;
      let ddy=(dx*invRadius*derivatives[d+3]+dy*invRadius*derivatives[d+4]+heightSlope*derivatives[d+5])/state.spacing;
      if(tapOn){
        const tx=x-state.tx,ty=y-state.ty,td=Math.sqrt(tx*tx+ty*ty),wave=(td+heightPhase-tapRadius)/.38;
        tapWave=Math.exp(-wave*wave)*tapPower;coordinate-=tapWave;
        const slope=-2*wave/.38*tapWave,inv=1/Math.max(td,.0001);
        ddx-=slope*(tx*inv*derivatives[d]+ty*inv*derivatives[d+1]+heightSlope*derivatives[d+2]);
        ddy-=slope*(tx*inv*derivatives[d+3]+ty*inv*derivatives[d+4]+heightSlope*derivatives[d+5]);
      }
      const lineDistance=Math.abs(coordinate-Math.floor(coordinate+.5));
      const wall=level>0&&level<1?smooth(level/.19)*smooth((1-level)/.19):0;
      const footprint=Math.max(Math.abs(ddx)+Math.abs(ddy),.0001),halfWidth=Math.sqrt(ddx*ddx+ddy*ddy)*pixelRatio*(RING_WIDTH*.5+raised*.06+wall*.035);
      const opacity=(dark?.24:.18)+((dark?.60:.46)-(dark?.24:.18))*raised+wall*.07+tapWave*.12;
      const alpha=clamp((halfWidth+footprint*.5-lineDistance)/footprint)*opacity*edgeFade[i];
      data[k+3]=Math.round(255*alpha);
    }
    g.putImageData(buffer,0,0);
    // A very fine upper seam clarifies the exact silhouette without a filled face.
    const c=Math.cos(state.angle),s=Math.sin(state.angle);
    g.save();g.setTransform(width/w,0,0,height/h,0,0);g.beginPath();
    for(const segment of rim){
      segment.forEach((p,i)=>{
        const x=state.ox+(c*p[0]+s*p[1])*state.scale;
        const y=state.oy+(state.flatten*(-s*p[0]+c*p[1])-RISE*LIFT)*state.scale;
        if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
      });
    }
    g.lineWidth=.60;g.lineCap='round';g.strokeStyle=dark?'rgba(209,237,255,.46)':'rgba(46,87,153,.32)';g.stroke();g.restore();
  }
  return {resize,draw,dispose(){buffer=positions=derivatives=edgeFade=null;}};
}

/** A transparent, more legible contour extrusion over an independent backdrop. */
export async function createGradientContourHero({el,signal,reduced=false,theme='light'}){
  const shape=await getShape();
  if(signal?.aborted)throw new DOMException('Scene cancelled','AbortError');
  let canvas=document.createElement('canvas'),painter;
  try{painter=createGPU(canvas,shape,theme==='dark');canvas.dataset.renderer='webgl';}
  catch{canvas=document.createElement('canvas');painter=createCanvas(canvas,shape,theme==='dark');canvas.dataset.renderer='canvas';}
  canvas.className='gradient-relief-canvas';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',pointerEvents:'none'});
  el.append(canvas);
  let w=1,h=1,mx=0,my=0,last=-1,dead=false,dirty=true,tapTime=-10,tx=0,ty=0;
  let scale=1,ox=.5,oy=.5,spacing=.16;
  function resize(width,height){
    if(dead)return;
    w=Math.max(1,Number(width)||1);h=Math.max(1,Number(height)||1);
    scale=Math.min(w/7.05,h/4.85);ox=w*.5;oy=h*.49;
    const minimumSpacing=.13-.075*smooth((w-480)/280);
    spacing=Math.max(adaptiveRingSpacing(w,h)/scale,minimumSpacing)*RING_SPACING;
    painter.resize(w,h);dirty=true;
  }
  function frame(time,dt=0,input={}){
    if(dead)return;
    const t=reduced?2.05:Math.max(0,Number(time)||0);
    if(last>=0&&t<last){mx=my=0;tapTime=-10;dirty=true;}
    if(reduced&&!dirty)return;
    if(!dirty&&t===last)return;
    if(!dirty&&last>=0&&t>last&&t-last<.027&&!input.pressed)return;
    const step=clamp(t-last,0,.075),follow=1-Math.exp(-4.5*step),active=!reduced&&(input.active||input.dragging);
    mx+=(active?clamp(Number(input.x)||0,-1,1)-mx:-mx)*follow;
    my+=(active?clamp(Number(input.y)||0,-1,1)-my:-my)*follow;
    const angle=.32+mx*.075,flatten=.62+my*.045;
    if(!reduced&&input.pressed){
      const qx=((clamp(input.pressX??input.x??0,-1,1)+1)*w*.5-ox)/scale;
      const qy=((clamp(input.pressY??input.y??0,-1,1)+1)*h*.5-oy)/(scale*flatten);
      tx=Math.cos(angle)*qx-Math.sin(angle)*qy;ty=Math.sin(angle)*qx+Math.cos(angle)*qy;tapTime=t;
    }
    painter.draw({w,h,scale,ox,oy,spacing,angle,flatten,sx:-1.10+mx*.72,sy:1.60+my*.54,t,tx,ty,age:t-tapTime});
    canvas.dataset.phase=(((t+PHASE_OFFSET)%PERIOD)/PERIOD).toFixed(3);
    last=t;dirty=false;
  }
  function dispose(){if(dead)return;dead=true;signal?.removeEventListener('abort',dispose);painter.dispose();canvas.remove();}
  signal?.addEventListener('abort',dispose,{once:true});
  const box=el.getBoundingClientRect();resize(box.width,box.height);
  return {frame,resize,dispose};
}
