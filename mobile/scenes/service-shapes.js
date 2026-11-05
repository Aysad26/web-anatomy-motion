import * as THREE from 'three';

// The Aa outlines derive from the local WA Flex Wide font (Roboto Flex, OFL).
// The A's overlapping font contours have been united before extrusion so its
// particles do not reveal a seam across the crossbar.
const GLYPHS = {
  A: [['M',-37,0],['L',495,0],['L',646,263],['L',1546,263],['L',1696,0],['L',2252,0],['L',1376,1463],['L',846,1463],['Z'],['M',820,567],['L',1009,896],['Q',1039,953,1058,985.5],['Q',1077,1018,1093,1051],['L',1099,1051],['Q',1117,1019,1136.5,985.5],['Q',1156,952,1184,896],['L',1372,567],['Z']],
  a: [['M',41,283],['Q',41,146,185,66.5],['Q',329,-13,590,-13],['Q',854,-13,1023.5,30.5],['Q',1193,74,1257,139],['Q',1261,84,1272.5,54.5],['Q',1284,25,1307,0],['L',1770,0],['L',1770,13],['Q',1742,47,1728.5,95],['Q',1715,143,1715,197],['L',1715,576],['Q',1715,774,1535,866],['Q',1355,958,955,958],['Q',583,958,376.5,862],['Q',170,766,170,619],['L',170,596],['L',583,594],['L',583,618],['Q',583,661,660,684.5],['Q',737,708,912,708],['Q',1105,708,1178.5,684],['Q',1252,660,1252,619],['L',1252,551],['L',645,556],['Q',348,559,194.5,489.5],['Q',41,420,41,283],['Z'],['M',497,319],['Q',497,361,573,373.5],['Q',649,386,816,385],['L',1252,382],['L',1252,368],['Q',1252,289,1112.5,251.5],['Q',973,214,804,214],['Q',641,214,569,242],['Q',497,270,497,319],['Z']]
};
const TAU = Math.PI * 2;
const material = new THREE.MeshBasicMaterial();
const v3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);

function mesh(parent, geometry, x=0, y=0, z=0, weight=1) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x,y,z);
  item.userData.sampleWeight = weight;
  parent.add(item);
  return item;
}

function roundRect(width,height,radius) {
  const x=-width/2,y=-height/2,r=Math.min(radius,width/2,height/2);
  const s=new THREE.Shape();
  s.moveTo(x+r,y); s.lineTo(x+width-r,y);
  s.quadraticCurveTo(x+width,y,x+width,y+r);
  s.lineTo(x+width,y+height-r);
  s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  s.lineTo(x+r,y+height);
  s.quadraticCurveTo(x,y+height,x,y+height-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
  return s;
}

function extrude(shape, depth, bevel=.015) {
  const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:18,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2});
  g.translate(0,0,-depth/2);
  return g;
}

function plate(parent,w,h,r,d,x,y,z,weight=1) {
  return mesh(parent,extrude(roundRect(w,h,r),d,Math.min(d*.14,.016)),x,y,z,weight);
}

function dot(parent,x,y,z,r=.055) {
  return mesh(parent,new THREE.SphereGeometry(r,12,8),x,y,z,2.4);
}

function stroke(parent,points,width,z,weight=2.5) {
  // Polygonal, bevelled strokes read like the raised code marks in the preview.
  const path=points.map(([x,y])=>new THREE.Vector2(x,y));
  const left=[],right=[];
  for(let i=0;i<path.length;i++) {
    const before=path[Math.max(0,i-1)],after=path[Math.min(path.length-1,i+1)];
    const tangent=after.clone().sub(before).normalize();
    const n=new THREE.Vector2(-tangent.y,tangent.x).multiplyScalar(width/2);
    if(i>0&&i<path.length-1) {
      const segment=path[i].clone().sub(path[i-1]).normalize();
      const edgeNormal=new THREE.Vector2(-segment.y,segment.x);
      n.multiplyScalar(1/Math.max(.5,Math.abs(n.clone().normalize().dot(edgeNormal))));
    }
    left.push(path[i].clone().add(n)); right.push(path[i].clone().sub(n));
  }
  const shape=new THREE.Shape([...left,...right.reverse()]);
  return mesh(parent,extrude(shape,.065,.012),0,0,z,weight);
}

function makeDesign() {
  const root=new THREE.Group();
  for(const [char,x,scale] of [['A',-1.81,1],['a',.035,1.14]]) {
    const path=new THREE.ShapePath(),sx=.55/700*scale,sy=1/700*scale;
    for(const [cmd,...p] of GLYPHS[char]) {
      if(cmd==='M')path.moveTo(p[0]*sx,p[1]*sy);
      else if(cmd==='L')path.lineTo(p[0]*sx,p[1]*sy);
      else if(cmd==='Q')path.quadraticCurveTo(p[0]*sx,p[1]*sy,p[2]*sx,p[3]*sy);
      else if(cmd==='C')path.bezierCurveTo(p[0]*sx,p[1]*sy,p[2]*sx,p[3]*sy,p[4]*sx,p[5]*sy);
      else path.currentPath.closePath();
    }
    const shapes=path.toShapes(true);
    const glyph=mesh(root,extrude(shapes,.39,.018),x,-1.10,0);
    glyph.userData.sampleWeight=1;
  }
  // A restrained editing curve is a secondary cue, rather than a fourth icon.
  const curve=new THREE.CubicBezierCurve3(v3(-.66,1.25,.02),v3(.07,1.29,.02),v3(.91,1.14,.02),v3(1.34,.68,.02));
  mesh(root,new THREE.TubeGeometry(curve,36,.008,4,false),0,0,0,2.3);
  for(const p of [curve.getPoint(0),curve.getPoint(1)]) {
    mesh(root,new THREE.BoxGeometry(.078,.078,.045),p.x,p.y,p.z,2.7);
  }
  return root;
}

function makeDevelopment() {
  const root=new THREE.Group(),stack=new THREE.Group();
  root.add(stack);
  stack.rotation.set(-1.04,.08,-.095);
  const width=3.40,height=1.96,depth=.105,space=1.12;
  for(let i=0;i<3;i++) {
    const z=(i-1)*space;
    plate(stack,width,height,.19,depth,0,0,z,i===2?.65:.40);
    const frame=roundRect(width+.014,height+.014,.195);
    const cutout=roundRect(width-.049,height-.049,.164);
    const hole=new THREE.Path();hole.curves=cutout.curves;frame.holes.push(hole);
    mesh(stack,extrude(frame,.019,.003),0,0,z+depth/2+.008,3.8);
    // A slightly inset rim supplies the lowermost layer's material thickness.
    if(i===0) plate(stack,3.19,1.75,.13,.027,0,0,z+depth*.56,.55);
  }
  const top=space+depth/2+.052;
  for(let i=0;i<3;i++)dot(stack,-1.24+i*.20,.68,top,.052);
  plate(stack,2.94,.025,.012,.026,0,.49,top,.85);
  stroke(stack,[[-.48,.23],[-.90,-.08],[-.48,-.39]],.15,top+.015,7);
  stroke(stack,[[.48,.23],[.90,-.08],[.48,-.39]],.15,top+.015,7);
  stroke(stack,[[.22,.34],[-.22,-.49]],.145,top+.015,7);
  const middle=depth/2+.055;
  for(let i=0;i<3;i++)plate(stack,1.20-i*.10,.11,.05,.046,-.76,-.16-i*.28,middle,5);
  for(let col=0;col<2;col++)for(let row=0;row<2;row++)plate(stack,.57,.35,.065,.042,.48+col*.68,-.20-row*.45,middle,3.3);
  root.userData.creaseRatio=.18;
  return root;
}

function makeSupport() {
  const root=new THREE.Group();
  plate(root,2.35,1.91,.19,.18,0,0,.02,1.08);
  const front=.155;
  for(let i=0;i<3;i++)dot(root,-.87+i*.19,.69,front,.050);
  plate(root,2.03,.021,.01,.025,0,.48,front,.9);
  for(let i=0;i<3;i++)plate(root,1.36-(i===2?.20:0),.11,.05,.055,-.18,.18-i*.34,front+.014,2.7);
  dot(root,.80,.18,front+.025,.108);
  // This is a continuous, broad elliptical ribbon, not a line orbit. Rotating
  // the ribbon's plane puts its lower arc in front of the upright interface.
  const ribbon=new THREE.Group();
  ribbon.rotation.set(.53,-.16,.31);
  root.add(ribbon);
  const outer=new THREE.Shape();
  outer.absellipse(0,0,2.03,1.63,0,TAU,false,0);
  const hole=new THREE.Path();
  hole.absellipse(0,0,1.78,1.37,0,TAU,true,0);
  outer.holes.push(hole);
  mesh(ribbon,extrude(outer,.34,.022),0,0,0,1.08);
  return root;
}

const random=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

function prepare(root) {
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root,true),center=bounds.getCenter(v3()),size=bounds.getSize(v3());
  const factor=Math.min(4.40/size.x,3.65/size.y);
  root.position.copy(center).multiplyScalar(-factor);
  root.scale.set(factor,factor,Math.min(factor,2.25/size.z));
  // Account for the independently compressed depth when centering.
  root.position.z=-center.z*root.scale.z;
  root.updateMatrixWorld(true);
  let maxRadius=0;
  const p=v3();
  root.traverse(item=>{
    if(!item.isMesh)return;
    const positions=item.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)maxRadius=Math.max(maxRadius,p.fromBufferAttribute(positions,i).applyMatrix4(item.matrixWorld).length());
  });
  if(maxRadius>2.53) {
    const f=2.53/maxRadius;
    root.scale.multiplyScalar(f);root.position.multiplyScalar(f);
    root.updateMatrixWorld(true);
  }
}

function sample(root,count,seed) {
  prepare(root);
  const faces=[],edges=new Map(),rand=random(seed),a=v3(),b=v3(),c=v3(),n=v3(),d=v3();
  const key=p=>`${Math.round(p.x*1e5)},${Math.round(p.y*1e5)},${Math.round(p.z*1e5)}`;
  let area=0,length=0;
  root.traverse(item=>{
    if(!item.isMesh)return;
    const {geometry,matrixWorld}=item,positions=geometry.getAttribute('position'),indices=geometry.index;
    const weight=item.userData.sampleWeight||1;
    for(let i=0;i<(indices?.count??positions.count);i+=3) {
      a.fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(matrixWorld);
      b.fromBufferAttribute(positions,indices?indices.getX(i+1):i+1).applyMatrix4(matrixWorld);
      c.fromBufferAttribute(positions,indices?indices.getX(i+2):i+2).applyMatrix4(matrixWorld);
      n.subVectors(b,a).cross(d.subVectors(c,a));
      const size=n.length()*.5;
      if(size<1e-10)continue;
      n.normalize();
      // Keep a full volume, while spending more grains on the hero-facing surfaces.
      const visibility=.22+.78*Math.max(0,n.x*.24+n.y*.12+n.z*.963);
      const face={a:a.clone(),b:b.clone(),c:c.clone(),n:n.clone(),end:area+=size*weight*visibility};
      const id=faces.push(face)-1;
      for(const [p,q] of [[face.a,face.b],[face.b,face.c],[face.c,face.a]]) {
        const k=[key(p),key(q)].sort().join('|');
        if(!edges.has(k))edges.set(k,{p,q,ids:[],weight});
        edges.get(k).ids.push(id);
      }
    }
  });
  const creases=[...edges.values()].filter(edge=>edge.ids.length===1||edge.ids.some(id=>faces[id].n.dot(faces[edge.ids[0]].n)<.84));
  for(const edge of creases)edge.end=length+=edge.p.distanceTo(edge.q)*Math.sqrt(edge.weight);
  const surfaceCount=Math.round(count*(1-(root.userData.creaseRatio||.11))),samples=[],point=v3();
  let faceId=0,edgeId=0;
  for(let i=0;i<count;i++) {
    let normal;
    if(i<surfaceCount||!creases.length) {
      const at=area*(i+rand())/surfaceCount;
      while(faceId<faces.length-1&&faces[faceId].end<at)faceId++;
      const face=faces[faceId],u=Math.sqrt(rand()),v=rand();
      point.copy(face.a).multiplyScalar(1-u).addScaledVector(face.b,u*(1-v)).addScaledVector(face.c,u*v);
      normal=face.n;
    } else {
      const at=length*(i-surfaceCount+rand())/(count-surfaceCount);
      while(edgeId<creases.length-1&&creases[edgeId].end<at)edgeId++;
      const edge=creases[edgeId],start=creases[edgeId-1]?.end||0;
      point.copy(edge.p).lerp(edge.q,(at-start)/(edge.end-start));
      normal=faces[edge.ids[Math.floor(rand()*edge.ids.length)]].n;
    }
    samples.push({x:point.x,y:point.y,z:point.z,nx:normal.x,ny:normal.y,nz:normal.z,key:morton(point)});
  }
  samples.sort((a,b)=>a.key-b.key||a.x-b.x||a.y-b.y||a.z-b.z);
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3);
  for(let i=0;i<count;i++) {
    const p=samples[i],j=i*3;
    positions[j]=p.x;positions[j+1]=p.y;positions[j+2]=p.z;
    normals[j]=p.nx;normals[j+1]=p.ny;normals[j+2]=p.nz;
  }
  root.traverse(item=>item.geometry?.dispose());
  return {positions,normals};
}

function morton(p) {
  // A common fixed domain preserves neighbourhoods between different subjects.
  const spread=v=>{v&=1023;v=(v|(v<<16))&0x030000ff;v=(v|(v<<8))&0x0300f00f;v=(v|(v<<4))&0x030c30c3;v=(v|(v<<2))&0x09249249;return v;};
  const q=v=>Math.max(0,Math.min(1023,Math.round((v+2.6)/5.2*1023)));
  return (spread(q(p.x))|(spread(q(p.y))<<1)|(spread(q(p.z))<<2))>>>0;
}

// Targets are immutable scene data. Reusing them avoids resampling on theme changes.
const targetCache=new Map();
const logoCache=new Map();

/** Three deterministic, equally sized particle targets: design, development, support. */
export async function createServiceShapes(count=9000) {
  if(!Number.isInteger(count)||count<1)throw new RangeError('Particle count must be a positive integer');
  if(!targetCache.has(count)) {
    targetCache.set(count,[makeDesign,makeDevelopment,makeSupport].map((build,i)=>sample(build(),count,54719+i*1729)));
  }
  return targetCache.get(count);
}

/** The original mark, sampled in the same domain as the three service targets. */
export async function createServiceLogoShape(count=9000) {
  if(!Number.isInteger(count)||count<1)throw new RangeError('Particle count must be a positive integer');
  if(!logoCache.has(count)) {
    const target=import('../../mark-kit.js').then(({loadMark})=>loadMark()).then(root=>{
      root.userData.creaseRatio=.14;
      try{return sample(root,count,631043);}
      finally{root.traverse(item=>item.material?.dispose());}
    }).catch(error=>{logoCache.delete(count);throw error;});
    logoCache.set(count,target);
  }
  return logoCache.get(count);
}
