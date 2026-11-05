import {createStudySurface,traceMark} from './study-kit.js';
import {tileMark} from './griddler.js';

const W=83,H=57;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

function paint(surface,ink,pose){
  const {g,width:w,height:h}=surface,scale=Math.min(w*.85,h*.75*W/H)/W;
  g.clearRect(0,0,w,h);
  g.save();g.translate(w*.5,h*.5);g.scale(scale,scale);
  g.fillStyle=ink;g.beginPath();
  if(pose.sx===1&&pose.sy===1){
    g.scale(pose.source,pose.source);g.translate(-W*.5,-H*.5);traceMark(g);
  }else tileMark(g,pose);
  g.fill();g.restore();
}

function assemblyPose(progress){
  const compression=mix(.50,1,progress);
  return {source:.95,sx:compression,sy:compression,pitch:W*.145};
}

export async function createAssemblyFragmentHero({el,signal,reduced=false,theme='light',isPaused=()=>false}){
  const surface=createStudySurface(el,signal),{canvas}=surface;
  canvas.dataset.study='griddler-assembly';
  const ink=theme==='dark'?'#f1f5ff':'#101521';
  let disposed=false,dirty=true,last=-1,previousPinned=false;
  let progress=0,velocity=0,target=0;
  function resize(w,h){if(surface.resize(w,h))dirty=true;}
  function frame(time,dt,input={}){
    if(disposed||signal?.aborted)return;
    const t=Math.max(0,Number(time)||0),pinned=input.assembled===true;
    const hovered=!reduced&&input.type==='mouse'&&input.active===true;
    target=pinned||hovered?1:0;
    const previous=progress,elapsed=last<0||t<last?0:clamp(t-last,0,.075);
    if(last<0||t<last||reduced||(pinned!==previousPinned&&isPaused())){
      progress=pinned?1:0;velocity=0;
    }else if(elapsed>0&&(progress!==target||velocity!==0)){
      // A critically damped response keeps the current position and velocity
      // when the user reverses direction halfway through a transition.
      const rate=12.8,offset=progress-target,bias=velocity+rate*offset,decay=Math.exp(-rate*elapsed);
      progress=clamp(target+(offset+bias*elapsed)*decay);
      velocity=(velocity-rate*bias*elapsed)*decay;
      if((progress===0&&velocity<0)||(progress===1&&velocity>0))velocity=0;
      if(Math.abs(progress-target)<.002&&Math.abs(velocity)<.035){progress=target;velocity=0;}
    }
    previousPinned=pinned;last=t;
    canvas.dataset.phase=progress===target?(target?'assembled':'grid'):target?'joining':'unfolding';
    if(dirty||progress!==previous){paint(surface,ink,assemblyPose(progress));dirty=false;}
  }
  function needsFrame(){
    return !disposed&&!signal?.aborted&&!reduced&&(progress!==target||velocity!==0);
  }
  return {frame,resize,needsFrame,dispose(){disposed=true;surface.dispose();}};
}

const CYCLE=10.60;
const POSES=[
  // second, source scale, horizontal and vertical compression, square pitch / W
  [0,.88,1,1,.111],
  [1.86,1,.58,1,.111],
  [3.32,1.025,.49,.72,.137],
  [4.75,.91,.47,.46,.178],
  [6.24,.37,.411,.418,.293],
  [7.16,.32,.54,.56,.282],
  [8.14,.50,.91,.92,.212],
  [9.18,.77,1,1,.132],
  [CYCLE,.88,1,1,.111]
];

function perspectivePose(phase){
  let i=1;
  while(i<POSES.length-1&&phase>POSES[i][0])i++;
  const a=POSES[i-1],b=POSES[i],f=smooth(clamp((phase-a[0])/(b[0]-a[0])));
  const source=mix(a[1],b[1],f),sx=mix(a[2],b[2],f),sy=mix(a[3],b[3],f);
  return {source,sx,sy,pitch:W*mix(a[4],b[4],f)};
}

export async function createPerspectiveFragmentHero({el,signal,reduced=false,theme='light'}){
  const surface=createStudySurface(el,signal),{canvas}=surface;
  canvas.dataset.study='griddler-perspective';
  canvas.style.transformOrigin='50% 50%';
  const ink=theme==='dark'?'#f1f5ff':'#101521';
  let disposed=false,dirty=true,last=-1,yaw=0,pitch=0,transform='';
  function resize(w,h){if(surface.resize(w,h))dirty=true;}
  function frame(time,dt,input={}){
    if(disposed||signal?.aborted)return;
    const t=reduced?0:Math.max(0,Number(time)||0);
    if(t<last){last=-1;yaw=pitch=0;dirty=true;}
    if(t===last&&!dirty)return;
    const elapsed=last<0?0:clamp(t-last,0,.075);
    const active=!reduced&&(input.dragging||(input.type==='mouse'&&input.active));
    const biasX=input.dragging?clamp(Number(input.dragX)||0,-.45,.45)*2.4:0;
    const biasY=input.dragging?clamp(Number(input.dragY)||0,-.45,.45)*2.4:0;
    const yawTarget=active?clamp(-(Number(input.x)||0)*11.65-biasX,-12,12):0;
    const pitchTarget=active?clamp((Number(input.y)||0)*10.8+biasY,-12,12):0;
    const follow=1-Math.exp(-elapsed*(active?8.6:7.3));
    yaw=mix(yaw,yawTarget,follow);pitch=mix(pitch,pitchTarget,follow);
    if(!active&&Math.abs(yaw)<.035&&Math.abs(pitch)<.035)yaw=pitch=0;
    const distance=Math.max(520,Math.max(surface.width,surface.height)*1.44);
    const nextTransform=yaw||pitch?`perspective(${distance.toFixed(1)}px) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg)`:'';
    if(transform!==nextTransform){canvas.style.transform=nextTransform;transform=nextTransform;}
    const phase=t%CYCLE;
    const pose=perspectivePose(phase);
    canvas.dataset.phase=phase<.46?'whole':phase<2.8?'comb':phase<5.35?'tiles':phase<7.46?'echo':'return';
    paint(surface,ink,pose);
    last=t;dirty=false;
  }
  return {frame,resize,dispose(){disposed=true;surface.dispose();}};
}
