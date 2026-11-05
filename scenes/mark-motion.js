import * as THREE from 'three';
import {loadMark, makeStudio} from '../mark-kit.js';

const TAU = Math.PI * 2;
const clamp = (x, a=0, b=1) => Math.min(b, Math.max(a, x));
const smooth = (a,b,x) => { const s=clamp((x-a)/(b-a)); return s*s*(3-2*s); };
const smoother = x => x*x*x*(x*(x*6-15)+10);

function makeCanvas(el, name) {
  const node=document.createElement('canvas');
  node.className=`motion-canvas ${name}`;
  node.setAttribute('aria-hidden','true');
  Object.assign(node.style,{position:'absolute',inset:'0',display:'block',width:'100%',height:'100%',pointerEvents:'none'});
  el.append(node);
  return node;
}

function releaseMark(mark) {
  const seen=new Set();
  mark.traverse(object=>{
    if(object.geometry&&!seen.has(object.geometry)){ seen.add(object.geometry); object.geometry.dispose(); }
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials) if(material&&!seen.has(material)){seen.add(material); material.dispose();}
  });
}

function surfaceTriangles(mark) {
  mark.updateMatrixWorld(true);
  const triangles=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const abc=new THREE.Vector3(),acb=new THREE.Vector3();
  mark.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const {geometry,matrixWorld}=mesh, pos=geometry.getAttribute('position'), ind=geometry.index;
    const count=ind?ind.count:pos.count;
    for(let i=0;i<count;i+=3){
      a.fromBufferAttribute(pos,ind?ind.getX(i):i).applyMatrix4(matrixWorld);
      b.fromBufferAttribute(pos,ind?ind.getX(i+1):i+1).applyMatrix4(matrixWorld);
      c.fromBufferAttribute(pos,ind?ind.getX(i+2):i+2).applyMatrix4(matrixWorld);
      const n=abc.subVectors(b,a).cross(acb.subVectors(c,a));
      const area=n.length()*.5;
      if(area>1e-8) triangles.push({a:a.clone(),b:b.clone(),c:c.clone(),n:n.clone().normalize(),area});
    }
  });
  return triangles;
}

function seedRandom() {
  let s=740391;
  return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
}

function samplePoints(triangles, count) {
  const rand=seedRandom(), pos=new Float32Array(count*3), ori=new Float32Array(count*3), meta=new Float32Array(count*4);
  const normals=new Float32Array(count*3), faceIndex=new Uint16Array(count);
  let total=0; const ends=triangles.map(tri=>(total+=tri.area));
  // Give the true creases a finer grain. The diagonals of coplanar triangles
  // are deliberately excluded so they cannot show through the lettering.
  const edges=new Map(), edgePoint=p=>[p.x,p.y,p.z].map(n=>Math.round(n*1e5)).join(',');
  triangles.forEach(({a,b,c},face)=>{
    for(const [start,end] of [[a,b],[b,c],[c,a]]){
      const key=[edgePoint(start),edgePoint(end)].sort().join('|');
      if(!edges.has(key))edges.set(key,{start,end,faces:[]});
      edges.get(key).faces.push(face);
    }
  });
  const creases=[...edges.values()].filter(({faces})=>faces.length===1||faces.some(i=>triangles[i].n.dot(triangles[faces[0]].n)<.97));
  let length=0; const edgeEnds=creases.map(({start,end})=>(length+=start.distanceTo(end)));
  const surfaceCount=creases.length?Math.round(count*.87):count;
  const p=new THREE.Vector3();
  let face=0, edge=0;
  for(let i=0;i<count;i++){
    const isEdge=i>=surfaceCount;
    if(!isEdge){
      const area=total*(i+rand())/surfaceCount;
      while(ends[face]<area&&face<ends.length-1)face++;
      const tri=triangles[face],u=Math.sqrt(rand()),v=rand();
      p.copy(tri.a).multiplyScalar(1-u).addScaledVector(tri.b,u*(1-v)).addScaledVector(tri.c,u*v);
    }else{
      const at=length*(i-surfaceCount+rand())/(count-surfaceCount);
      while(edgeEnds[edge]<at&&edge<edgeEnds.length-1)edge++;
      const {start,end,faces}=creases[edge];
      const startAt=edge?edgeEnds[edge-1]:0;
      p.copy(start).lerp(end,clamp((at-startAt)/Math.max(1e-6,edgeEnds[edge]-startAt)));
      face=faces[Math.floor(rand()*faces.length)];
    }
    const lane=p.x<-.75?-1:p.x>.75?1:0, angle=rand()*TAU, distance=.2+rand()*.9;
    const j=i*3,k=i*4;
    pos[j]=p.x; pos[j+1]=p.y; pos[j+2]=p.z;
    triangles[face].n.toArray(normals,j); faceIndex[i]=face;
    ori[j]=p.x*.58 + lane*1.44 + Math.cos(angle)*distance;
    ori[j+1]=p.y*.38 + (lane===0?1.4:-lane*.54) + Math.sin(angle)*distance*.66;
    ori[j+2]=p.z*.45 + (rand()-.5)*1.6;
    meta[k]=rand()*.34+Math.abs(lane)*.08;
    meta[k+1]=(isEdge?.87:1.08)+Math.pow(rand(),1.6)*(isEdge?1.23:1.92);
    meta[k+2]=rand();
    meta[k+3]=rand()<(isEdge?.13:.035) && (Math.abs(p.x)>1.35 || Math.abs(p.y)>1.35) ? 1 : 0;
  }
  return {pos,ori,meta,normals,faceIndex,count};
}

function createPointObject(data) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(data.pos,3));
  geometry.setAttribute('originPoint',new THREE.BufferAttribute(data.ori,3));
  geometry.setAttribute('pointMeta',new THREE.BufferAttribute(data.meta,4));
  geometry.setAttribute('grainNormal',new THREE.BufferAttribute(data.normals,3));
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uDpr:{value:1},uWidth:{value:1},uSize:{value:1},uTouch:{value:0},uPointer:{value:new THREE.Vector2()}},
    transparent:true,depthWrite:true,depthTest:true,toneMapped:false,
    vertexShader:`
      attribute vec3 originPoint;
      attribute vec4 pointMeta;
      attribute vec3 grainNormal;
      uniform float uTime, uDpr, uWidth, uSize, uTouch;
      uniform vec2 uPointer;
      varying vec4 vGrain;
      void main(){
        float p=clamp((uTime-pointMeta.x)/(1.68-pointMeta.x),0.0,1.0);
        float f=p*p*p*(p*(p*6.0-15.0)+10.0);
        vec3 origin=originPoint; origin.x=mix(position.x,origin.x,uWidth);
        vec3 r=mix(origin,position,f);
        float turn=sin(p*3.14159265)*(1.0-p);
        r.y+=turn*sin(pointMeta.z*18.0)*.62;
        r.z+=turn*cos(pointMeta.z*16.0)*.54;
        float formed=smoothstep(.91,1.71,uTime);
        float localLight=1.0-smoothstep(.22,1.1,length(position.xy*.31-uPointer));
        float glint=uTouch*pointMeta.w*formed*(.35+.65*localLight);
        r.xy += glint*(normalize(position.xy+vec2(.001))*.07+uPointer*.10);
        float appear=smoothstep(0.0,.25,uTime+pointMeta.x*.48);
        vec4 mv=modelViewMatrix*vec4(r,1.0);
        vec3 n=normalize(normalMatrix*grainNormal);
        float key=max(dot(n,vec3(-.36,.53,.77)),0.0);
        float blue=max(dot(n,vec3(.88,.31,-.35)),0.0);
        float front=smoothstep(-.42,.67,dot(n,normalize(-mv.xyz)));
        float shade=.16+key*.73+blue*.23;
        vec3 ink=vec3(.10,.14,.22), cobalt=vec3(.075,.34,.76);
        vec3 early=mix(ink,cobalt,step(.72,pointMeta.z));
        vec3 surface=mix(vec3(.10,.16,.27),vec3(.34,.56,.84),shade);
        surface += vec3(-.022,.025,.075)*(pointMeta.z-.20);
        surface += vec3((pointMeta.z-.46)*.12);
        surface=mix(surface,vec3(.38,.62,.94),glint*.67);
        float alpha=appear*mix(.36+pointMeta.z*.43,(.71+pointMeta.z*.27)*mix(.42,1.0,front),formed);
        vGrain=vec4(mix(early,surface,formed),alpha);
        gl_PointSize=(clamp(pointMeta.y*10.7/max(1.0,-mv.z),.94,3.12)*uSize+glint*.47)*uDpr;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      varying vec4 vGrain;
      void main(){
        vec2 p=gl_PointCoord-.5;
        float a=(1.0-smoothstep(.29,.50,length(p)))*vGrain.a;
        if(a<.045)discard;
        gl_FragColor=vec4(vGrain.rgb,a);
      }`,
  });
  const points=new THREE.Points(geometry,material);
  points.renderOrder=10;
  points.frustumCulled=false;
  return points;
}

function paintWave(g,w,h,t,p,reduced) {
  const mobile=w<620, start=w*(mobile?.012:.055), end=w-start;
  const midX=w*(.49 + p.x*.155), midY=h*(.52 + p.y*.047);
  const intro=reduced?1:smooth(.06,1.38,t);
  const swell=intro*(1-.28*smooth(1.36,2.4,t));
  const clock=reduced?1.8:t;
  const rows=mobile?34:43, samples=mobile?77:123;
  const field=h*(mobile?.50:.52), span=end-start;
  const minA=.31+.09*Math.abs(p.x), maxA=.73+.03*p.x;
  const grey=g.createLinearGradient(start,0,end,0);
  grey.addColorStop(0,'rgba(38,49,67,0)');
  grey.addColorStop(.21,'rgba(38,49,67,.18)');
  grey.addColorStop(.46,'rgba(38,49,67,.29)');
  grey.addColorStop(.74,'rgba(38,49,67,.15)');
  grey.addColorStop(1,'rgba(38,49,67,0)');
  const blue=g.createLinearGradient(start,0,end,0);
  blue.addColorStop(0,'rgba(31,83,175,0)');
  blue.addColorStop(minA,'rgba(31,83,175,.15)');
  blue.addColorStop((minA+maxA)*.5,'rgba(29,88,202,.60)');
  blue.addColorStop(maxA,'rgba(28,95,222,.24)');
  blue.addColorStop(1,'rgba(31,83,175,0)');
  const cursorWave=Math.hypot(p.x,p.y)*.018, amplitude=h*(.104+cursorWave);
  g.globalAlpha=intro;
  for(let row=0;row<rows;row++){
    const f=row/(rows-1), fy=(f-.5)*field+midY;
    const live=(row===Math.floor(rows*.61)||row===Math.floor(rows*.64)||row===Math.floor(rows*.67));
    const inner=Math.exp(-Math.pow((f-.49)/.32,2));
    g.beginPath();
    for(let col=0;col<=samples;col++){
      const x=start+span*(col/samples), d=(x-midX)/w;
      const envelope=Math.exp(-d*d*(mobile?15:20));
      const crest=Math.cos(d*19-clock*1.14+f*5.25);
      const ripple=Math.sin(d*35+clock*.73-f*7.1)*.17;
      const bend=(crest+ripple)*amplitude*inner*envelope*swell;
      const drift=Math.sin(d*8-clock*.22+f*3.1)*h*.012*envelope;
      const y=fy+bend+drift;
      if(col===0)g.moveTo(x,y);else g.lineTo(x,y);
    }
    g.lineWidth=live?1.07:.72;
    g.strokeStyle=live?blue:grey;
    g.stroke();
  }
  g.globalAlpha=1;
}

function shadow(g,w,h,mode,t,p,reduced) {
  const intro=reduced?1:mode==='particles'?smooth(1.1,2.03,t):smooth(.03,1.62,t);
  const rx=Math.min(w*.24,h*.44), ry=h*.058;
  g.save();
  g.translate(w*(.50 + p.x*.011),h*(mode==='waves'?.744:.769));
  g.scale(1,ry/rx);
  const fill=g.createRadialGradient(0,0,0,0,0,rx);
  fill.addColorStop(0,`rgba(40,60,99,${.13*intro})`);
  fill.addColorStop(.56,`rgba(45,66,108,${.046*intro})`);
  fill.addColorStop(1,'rgba(55,81,123,0)');
  g.fillStyle=fill;
  g.fillRect(-rx,-rx,rx*2,rx*2);
  g.restore();
}

function softwareFrame(g,w,h,camera,holder,triangles,data,mode,t,p,scatter,size) {
  holder.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const view=new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,holder.matrixWorld);
  const m=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,view);
  const point=new THREE.Vector3();
  const project=(x,y,z)=>{
    point.set(x,y,z).applyMatrix4(m);
    return [(point.x*.5+.5)*w,(.5-point.y*.5)*h,point.z];
  };
  if(mode==='waves'){
    const v=new THREE.Vector3();
    const shade=[];
    for(const tri of triangles){
      const a=project(tri.a.x,tri.a.y,tri.a.z), b=project(tri.b.x,tri.b.y,tri.b.z), c=project(tri.c.x,tri.c.y,tri.c.z);
      if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>=0)continue;
      v.copy(tri.n).applyQuaternion(holder.quaternion);
      const key=Math.max(0,v.x*-.29+v.y*.63+v.z*.68);
      const side=Math.max(0,v.x*.89-v.y*.27+v.z*.22);
      shade.push({a,b,c,z:(a[2]+b[2]+c[2])/3, key,side});
    }
    shade.sort((a,b)=>b.z-a.z);
    g.globalAlpha=1;
    for(const face of shade){
      const {a,b,c,key,side}=face;
      const base=[51+157*key+16*side,70+152*key+31*side,103+143*key+48*side];
      const f=g.createLinearGradient(a[0],a[1],c[0]+.01,c[1]+.01);
      const rgb=(drift)=>`rgb(${base.map(n=>Math.round(Math.min(255,n+drift))).join(',')})`;
      f.addColorStop(0,rgb(-12)); f.addColorStop(.51,rgb(13));f.addColorStop(1,rgb(-4));
      g.beginPath(); g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.lineTo(c[0],c[1]);g.closePath();
      g.fillStyle=f;g.fill();
      g.strokeStyle=rgb(8);g.lineWidth=.42;g.stroke();
    }
    g.globalAlpha=1;
    return;
  }
  const {pos,ori,meta,faceIndex,count}=data;
  const formed=smooth(.91,1.71,t), viewNormals=new THREE.Matrix3().getNormalMatrix(view);
  const n=new THREE.Vector3();
  const lighting=triangles.map(tri=>{
    n.copy(tri.n).applyNormalMatrix(viewNormals);
    const key=Math.max(0,n.x*-.36+n.y*.53+n.z*.77), blue=Math.max(0,n.x*.88+n.y*.31-n.z*.35);
    const shade=.16+key*.73+blue*.23;
    const colours=Array.from({length:8},(_,i)=>{
      const tone=(i+.5)/8, early=tone>.72?[.075,.34,.76]:[.10,.14,.22];
      const rgb=[.10+.24*shade-.022*(tone-.20),.16+.40*shade+.025*(tone-.20),.27+.57*shade+.075*(tone-.20)];
      return `rgb(${rgb.map((x,k)=>Math.round(255*clamp(early[k]+formed*(x+(tone-.46)*.12-early[k])))).join(',')})`;
    });
    return {front:smooth(-.42,.67,n.z),colours};
  });
  const packed=data.softwarePacked??=new Float32Array(count*5);
  const bins=data.softwareBins??=Array.from({length:24},()=>[]);
  for(const bin of bins)bin.length=0;
  const depth=view.elements;
  for(let i=0;i<count;i++){
    const j=i*3,k=i*4,tone=meta[k+2],light=lighting[faceIndex[i]];
    const local=meta[k+3]&&p.presence ? 1-smooth(.22,1.1,Math.hypot(pos[j]*.31-p.x,pos[j+1]*.31+p.y)) : 0;
    const glint=p.presence*meta[k+3]*formed*(.35+.65*local);
    const appear=smooth(0,.25,t+meta[k]*.48);
    const early=.36+tone*.43, late=(.71+tone*.27)*(.42+.58*light.front);
    const alpha=appear*(early+(late-early)*formed);
    if(alpha<.045)continue;
    const phase=clamp((t-meta[k])/(1.68-meta[k])), f=smoother(phase), turn=Math.sin(phase*Math.PI)*(1-phase);
    const x=pos[j]+(ori[j]-pos[j])*scatter*(1-f)+glint*(p.x*.10+Math.sign(pos[j])*.07);
    const y=pos[j+1]+(ori[j+1]-pos[j+1])*(1-f)+turn*Math.sin(tone*18)*.62-glint*p.y*.10;
    const z=pos[j+2]+(ori[j+2]-pos[j+2])*(1-f)+turn*Math.cos(tone*16)*.54;
    point.set(x,y,z).applyMatrix4(m);
    const viewZ=depth[2]*x+depth[6]*y+depth[10]*z+depth[14], q=i*5;
    packed[q]=(point.x*.5+.5)*w; packed[q+1]=(.5-point.y*.5)*h;
    packed[q+2]=(clamp(meta[k+1]*10.7/Math.max(1,-viewZ),.94,3.12)*size+glint*.47)*.46;
    packed[q+3]=alpha; packed[q+4]=glint;
    bins[clamp(Math.floor((viewZ+camera.position.z+3)*4),0,bins.length-1)].push(i);
  }
  for(const bin of bins)for(const i of bin){
    const q=i*5;
    g.fillStyle=packed[q+4]>.21?'#639ee9':lighting[faceIndex[i]].colours[Math.floor(meta[i*4+2]*8)];
    g.globalAlpha=packed[q+3];
    g.beginPath();g.arc(packed[q],packed[q+1],packed[q+2],0,TAU);g.fill();
  }
  g.globalAlpha=1;
}

async function createMarkMotion({el,signal,reduced}, mode) {
  const mark=await loadMark();
  if(signal?.aborted){ releaseMark(mark);throw new DOMException('Scene cancelled','AbortError'); }
  const triangles=surfaceTriangles(mark);
  if(!triangles.length){releaseMark(mark);throw new Error('Monogram contains no triangles');}
  const data=mode==='particles'?samplePoints(triangles,6240):null;
  const underlay=makeCanvas(el,'mark-underlay'), g=underlay.getContext('2d');
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(34,1,.1,60), holder=new THREE.Group();
  scene.add(holder);
  if(mode==='waves')holder.add(mark);
  let renderer, webglCanvas, freeStudio, points, softwareCanvas, fallback;
  try {
    webglCanvas=makeCanvas(el,'mark-webgl');
    const context=webglCanvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'high-performance'});
    if(!context)throw new Error('WebGL 2 is unavailable');
    renderer=new THREE.WebGLRenderer({canvas:webglCanvas,context,alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.03;
    if(data){points=createPointObject(data);holder.add(points);}
    else freeStudio=makeStudio(renderer,scene);
  } catch(error) {
    freeStudio?.(); renderer?.dispose(); webglCanvas?.remove(); renderer=null;
    softwareCanvas=makeCanvas(el,'mark-software'); fallback=softwareCanvas.getContext('2d');
  }
  let w=0,h=0,dpr=1,scatter=1,size=1,lastT=-1,disposed=false;
  let state={x:0,y:0,presence:0,dragX:0,dragY:0};

  function resize(width,height){
    if(disposed)return;
    w=Math.max(1,width);h=Math.max(1,height);dpr=Math.min(window.devicePixelRatio||1,w<680?1.6:1.85);
    for(const node of [underlay,softwareCanvas]) if(node){node.width=Math.round(w*dpr);node.height=Math.round(h*dpr);}
    g?.setTransform(dpr,0,0,dpr,0,0);
    fallback?.setTransform(dpr,0,0,dpr,0,0);
    camera.aspect=w/h;
    const framing=mode==='particles'?(w<650?8.0:9.1):(w<650?7.9:8.5);
    const viewHeight=Math.max(mode==='particles'?6.38:6.95,framing/camera.aspect);
    camera.position.set(0,.12,viewHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))));
    camera.lookAt(0,0,0);
    camera.updateProjectionMatrix();
    scatter=w<650?.71:1;
    size=clamp(Math.pow(Math.min(h,w*.89)/420,.47),.73,1.16);
    renderer?.setPixelRatio(dpr);renderer?.setSize(w,h,false);
    if(points){points.material.uniforms.uDpr.value=dpr;points.material.uniforms.uWidth.value=scatter;points.material.uniforms.uSize.value=size;}
  }

  function frame(t,dt,input={}){
    if(disposed||!w)return;
    if(t<lastT-.04)state={x:0,y:0,presence:0,dragX:0,dragY:0};
    lastT=t;
    const active=!reduced&&(input.active||input.dragging);
    const amount=1-Math.exp(-Math.min(Math.max(dt,.008),.06)*6.1);
    state.x+=((active?clamp(input.x||0,-1,1):0)-state.x)*amount;
    state.y+=((active?clamp(input.y||0,-1,1):0)-state.y)*amount;
    state.presence+=((active?1:0)-state.presence)*amount;
    state.dragX+=((reduced?0:clamp(input.dragX||0,-1.25,1.25))-state.dragX)*amount;
    state.dragY+=((reduced?0:clamp(input.dragY||0,-1.25,1.25))-state.dragY)*amount;
    const age=reduced?3:Math.max(0,t);
    const wave=mode==='waves', intro=reduced?1:smoother(clamp(t/1.70));
    const drift=reduced?0:Math.sin(Math.max(0,t-1.50)*.74)*.056;
    const angle=reduced?0:Math.sin(t*.52)*.048;
    holder.rotation.set(.065+state.y*.115+state.dragY*.23, -.18+(wave?-.145*(1-intro):0)+angle+state.x*.18+state.dragX*.32, -.032+(wave?.028*(1-intro):0)-state.x*.035);
    holder.position.set(state.x*.10,(wave?.35+(.21*(1-intro)):-.012)+drift+state.y*.035,0);
    if(wave)holder.scale.setScalar(.91+.09*intro);
    if(g){
      g.clearRect(0,0,w,h);
      if(wave)paintWave(g,w,h,age,state,reduced);
      shadow(g,w,h,mode,age,state,reduced);
    }
    if(renderer){
      if(points){
        const u=points.material.uniforms;
        u.uTime.value=age;u.uTouch.value=state.presence;u.uPointer.value.set(state.x,-state.y);
      }
      renderer.render(scene,camera);
    } else if(fallback){
      fallback.clearRect(0,0,w,h);
      softwareFrame(fallback,w,h,camera,holder,triangles,data,mode,age,state,scatter,size);
    }
  }

  function dispose(){
    if(disposed)return;
    disposed=true;
    points?.geometry.dispose();points?.material.dispose();
    releaseMark(mark);
    freeStudio?.();
    renderer?.dispose();renderer?.forceContextLoss();
    underlay.remove();webglCanvas?.remove();softwareCanvas?.remove();
  }

  return {frame,resize,dispose};
}

export const createParticles=ctx=>createMarkMotion(ctx,'particles');
export const createWaves=ctx=>createMarkMotion(ctx,'waves');
