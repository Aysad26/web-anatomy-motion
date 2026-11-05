import {MARK_OUTLINES,createStudySurface,traceMark} from './study-kit.js';

const W=83,H=57,CYCLE=7.25,START=1.80;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=(a,b,t)=>{const u=clamp((t-a)/(b-a));return u*u*(3-2*u);};
const compact=(a,b,t)=>{const u=clamp((t-a)/(b-a));return u*u;};
const centered=MARK_OUTLINES.map(outline=>outline.map(([x,y])=>[x-W/2,y-H/2]));

function clip(poly,axis,edge,side){
  const out=[];
  if(!poly.length)return out;
  let a=poly.at(-1),inside=(a[axis]-edge)*side>=0;
  for(const b of poly){
    const next=(b[axis]-edge)*side>=0;
    if(inside!==next){
      const t=(edge-a[axis])/(b[axis]-a[axis]);
      out.push(axis===0?[edge,mix(a[1],b[1],t)]:[mix(a[0],b[0],t),edge]);
    }
    if(next)out.push(b);
    a=b;inside=next;
  }
  return out;
}

function poseAt(t){
  // First the source grows, then compression along X makes the comb edges.
  // The second axis joins while the source stays large and recognizable.
  const spread=ease(START,2.10,t),column=ease(2.00,2.47,t),row=ease(2.89,3.20,t);
  const wide=ease(2.89,3.24,t),breathe=ease(3.28,4.10,t);
  const close=compact(3.96,4.40,t),tiny=ease(4.40,4.67,t),restore=ease(4.76,5.14,t);
  const zoom=mix(mix(.83,1,spread),.34,close);
  const source=mix(mix(zoom,.072,tiny),.83,restore);
  const echo=ease(4.15,4.38,t),release=ease(4.43,4.67,t);
  const sx=mix(1-.50*column-.082*echo,1,release);
  const sy=mix(1-.50*row-.082*echo,1,release);
  const pitch=W*(.111+.034*wide+.012*breathe+.140*echo);
  const name=t<START||t>=5.14?'rest':t<2.09?'zoom':t<2.96?'comb':t<3.96?'tiles':t<4.67?'collapse':'return';
  return {source,sx,sy,pitch,name};
}

// Griddler with Cut Tiles off: each destination cell sees the full source,
// compressed around that cell's centre. Only the destination clips the result.
// As the source shrinks, neighbouring cells catch cropped echoes naturally.
export function tileMark(g,{source,sx,sy,pitch}){
  const mx=source*sx,my=source*sy;
  const clipY=sy<.99995;
  const cols=Math.floor(W*source/(2*pitch)+.5/sx);
  const rows=clipY?Math.floor(H*source/(2*pitch)+.5/sy):0;
  const half=pitch*.5;
  for(let i=-cols;i<=cols;i++){
    const cx=i*pitch,dx=cx*(1-sx);
    const x0=(cx-half-dx)/mx,x1=(cx+half-dx)/mx;
    for(const p of centered){
      const column=clip(clip(p,0,x0,1),0,x1,-1);
      if(column.length<3)continue;
      for(let j=-rows;j<=rows;j++){
        const cy=j*pitch,dy=cy*(1-sy);
        const poly=clipY?clip(clip(column,1,(cy-half-dy)/my,1),1,(cy+half-dy)/my,-1):column;
        if(poly.length<3)continue;
        g.moveTo(poly[0][0]*mx+dx,poly[0][1]*my+dy);
        for(let k=1;k<poly.length;k++)g.lineTo(poly[k][0]*mx+dx,poly[k][1]*my+dy);
        g.closePath();
      }
    }
  }
}

export async function createGriddlerHero({el,signal,reduced=false,theme='light'}){
  const surface=createStudySurface(el,signal),{canvas,g}=surface;
  canvas.dataset.study='griddler';
  const ink=theme==='dark'?'#f1f5ff':'#101521';
  let disposed=false,dirty=true,last=-1,tap=-1,hover=0,prior='';
  function resize(w,h){if(surface.resize(w,h))dirty=true;}
  function frame(time,dt,input={}){
    if(disposed||signal?.aborted)return;
    const t=reduced?0:Math.max(0,Number(time)||0);
    if(t<last){last=-1;tap=-1;hover=0;dirty=true;prior='';}
    if(last===t&&!dirty&&!input.pressed)return;
    if(!reduced&&input.pressed)tap=t;
    const active=!reduced&&(input.active||input.dragging);
    const near=1-ease(.42,1.04,Math.hypot(input.x||0,input.y||0));
    const target=active?near*(input.dragging?1:.73):0;
    const elapsed=last<0?1/60:clamp(t-last,0,.075);
    hover=mix(hover,target,1-Math.exp(-elapsed*(active?9:6)));
    const phase=(tap<0?t:t-tap+START)%CYCLE;
    const pose=poseAt(phase);
    // A pointer changes compression, not the position of the grid or logo.
    const interact=hover*(1-ease(3.98,4.40,phase)+ease(4.76,5.14,phase));
    pose.sx=Math.min(pose.sx,1-.44*interact);
    pose.sy=Math.min(pose.sy,1-.20*interact);
    canvas.dataset.phase=pose.name;
    const whole=pose.sx>.9995&&pose.sy>.9995;
    const still=pose.name==='rest'&&whole?'rest':'';
    last=t;
    if(!dirty&&still&&still===prior)return;
    prior=still;dirty=false;
    const w=surface.width,h=surface.height,scale=Math.min(w*.85,h*.75*W/H)/W;
    g.clearRect(0,0,w,h);
    g.save();g.translate(w*.5,h*.5);g.scale(scale,scale);
    g.fillStyle=ink;g.beginPath();
    if(whole){g.scale(pose.source,pose.source);g.translate(-W*.5,-H*.5);traceMark(g);}
    else tileMark(g,pose);
    g.fill();g.restore();
  }
  return {frame,resize,dispose(){disposed=true;surface.dispose();}};
}
