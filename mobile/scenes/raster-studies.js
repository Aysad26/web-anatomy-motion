import {containsMark, createStudySurface, traceMark} from './study-kit.js';

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const fract = x => x - Math.floor(x);
const hash = (x,y) => fract(Math.sin(x*127.1+y*311.7)*43758.5453);
const sq = x => x*x;
const INK = {
  halo: {
    dark: [[248,170,177],[226,173,236],[197,185,249],[213,229,254],[255,245,226],[255,218,172],[255,153,103],[249,136,145]],
    light: [[164,52,106],[119,52,160],[66,69,158],[36,80,160],[57,101,140],[155,78,47],[175,54,37],[165,51,80]]
  },
  matrix: {
    dark: ['#eceaff','#a59bff','#83c1ff','#fffaff','#c9c4ff','#a7d9ff'],
    light: ['#2b305a','#62418a','#2f6190','#151b38','#413569','#235079']
  }
};

function colorWheel(palette,angle,highlight=0,dark=false) {
  const n=fract(angle)*palette.length,i=Math.floor(n),f=n-i;
  const a=palette[i],b=palette[(i+1)%palette.length],c=dark?[255,250,248]:[36,26,61];
  return 'rgb('+a.map((v,j)=>Math.round(lerp(lerp(v,b[j],f),c[j],highlight))).join(',')+')';
}
function mark(g,x,y,width) {
  const scale=width/83;
  g.translate(x-width*.5,y-57*scale*.5);
  g.scale(scale,scale);
  g.beginPath();
  traceMark(g);
}
function dot(g,x,y,r) {
  g.moveTo(x+r,y);
  g.arc(x,y,r,0,TAU);
}
function motion(reduced,still) {
  let last=-1,tap=-10,x=0,y=0,tx=0,ty=0,fresh=true;
  return {
    resize(){fresh=true;},
    read(time,input){
      const t=reduced?still:Math.max(0,Number(time)||0);
      if(t<last){last=-1;tap=-10;x=y=tx=ty=0;fresh=true;}
      if(!reduced&&input.pressed){tap=t;tx=clamp(input.pressX??input.x??0,-1,1);ty=clamp(input.pressY??input.y??0,-1,1);}
      if(!fresh&&(reduced||(t-last<1/42&&!input.pressed)))return null;
      const follow=1-Math.exp(-5.4*clamp(t-last,0,.075));
      const active=!reduced&&(input.active||input.dragging);
      x=lerp(x,active?clamp(input.x||0,-1,1):0,follow);
      y=lerp(y,active?clamp(input.y||0,-1,1):0,follow);
      last=t;fresh=false;
      return {t,x,y,tx,ty,age:t-tap};
    }
  };
}

export async function createHalftoneHero({el,signal,reduced=false,theme='light'}) {
  const surface=createStudySurface(el,signal),g=surface.g,dark=theme==='dark';
  surface.canvas.dataset.study='halftone';
  const animator=motion(reduced,2.25),palette=INK.halo[dark?'dark':'light'];
  const tones=32,bins=Array.from({length:tones*3},()=>[]);
  const colors=bins.map((_,i)=>colorWheel(palette,(i%tones+.5)/tones,Math.floor(i/tones)*.155,dark));
  let grid=[],w=0,h=0,d=0,cell=0,dead=false;
  function prepare(){
    w=surface.width;h=surface.height;
    d=Math.max(1,Math.min(w*.98,h*.98));
    cell=clamp(d/65,2.65,11);
    const bound=Math.ceil(d*.54/cell);
    grid=[];
    for(let i=-bound;i<=bound;i++)for(let j=-bound;j<=bound;j++){
      const x=(i-j)*cell*Math.SQRT1_2,y=(i+j)*cell*Math.SQRT1_2,dist=Math.hypot(x,y)/d;
      if(dist>.526||dist<.202)continue;
      const theta=Math.atan2(y,x);
      grid.push({x,y,dist,theta,co:Math.cos(theta),si:Math.sin(theta),seed:hash(i,j)});
    }
  }
  function resize(width,height){if(surface.resize(width,height)){prepare();animator.resize();}}
  function frame(time,dt,input={}){
    if(dead||signal?.aborted)return;
    const state=animator.read(time,input);if(!state)return;
    const {t,x,y,tx,ty,age}=state;
    g.clearRect(0,0,w,h);
    const cx=w*.50+x*d*.034,cy=h*.51+y*d*.034;
    const phase=t*.83,orbit=phase-.89,drift=.038*Math.sin(phase*.62);
    const wave=age>=0&&age<1.68?1-smooth(.65,1.68,age):0;
    const waveX=(tx+1)*w*.5-cx,waveY=(ty+1)*h*.5-cy;
    // Soft reflected ink follows the annulus; the large centre remains open.
    const haze=g.createRadialGradient(cx,cy,d*.204,cx,cy,d*.506);
    haze.addColorStop(0,dark?'#d7aeff00':'#c1a8c000');
    haze.addColorStop(.45,dark?'#9475f02f':'#7550aa17');
    haze.addColorStop(.72,dark?'#9475f016':'#9776ba0d');
    haze.addColorStop(1,dark?'#9475f000':'#9776ba00');
    g.fillStyle=haze;g.fillRect(cx-d*.51,cy-d*.51,d*1.02,d*1.02);

    for(const group of bins)group.length=0;
    for(const p of grid){
      const bend=(x*p.co+y*p.si)*.017;
      const front=Math.pow(Math.max(0,Math.cos(p.theta-orbit)),13);
      const tail=Math.pow(Math.max(0,Math.cos(p.theta-orbit+.48)),6);
      const ring=.344+.010*Math.sin(phase+p.theta*2)+.009*Math.cos(phase*.74-p.theta*3)+bend+front*.011;
      const delta=p.dist-ring,spread=delta<0?.064:.089;
      let tone=Math.exp(-1.05*sq(delta/spread));
      tone*=smooth(.205,.263,p.dist)*(1-smooth(.451,.520,p.dist));
      let pulse=0;
      if(wave){
        const from=Math.hypot(p.x-waveX,p.y-waveY)/d;
        pulse=wave*Math.exp(-sq((from-age*.61)/.044));
        tone+=.36*pulse*smooth(.207,.255,p.dist)*(1-smooth(.475,.526,p.dist));
      }
      const rim=.97+.085*p.seed+.10*front+.045*tail;
      // At peak these discs touch, leaving a diamond-shaped negative raster.
      const radius=cell*.616*Math.pow(clamp(tone,0,1.18),.68)*rim;
      if(radius<.19)continue;
      const color=Math.floor(fract(p.theta/TAU+drift+.013*Math.sin(phase+p.dist*8))*tones);
      const flash=front*.57+tail*.30+pulse*.8;
      const band=flash>.59?2:flash>.24?1:0;
      bins[band*tones+color].push(p.x+cx,p.y+cy,radius);
    }
    bins.forEach((group,i)=>{
      if(!group.length)return;
      g.fillStyle=colors[i];g.beginPath();
      for(let j=0;j<group.length;j+=3)dot(g,group[j],group[j+1],group[j+2]);
      g.fill();
    });

    const logoWidth=d*.463;
    g.save();mark(g,cx,cy,logoWidth);
    const signInk=g.createLinearGradient(0,56,80,0);
    signInk.addColorStop(0,dark?'#c0c4fb':'#252b64');
    signInk.addColorStop(.47,dark?'#faf0f9':'#352353');
    signInk.addColorStop(1,dark?'#ffd8af':'#943f45');
    g.fillStyle=signInk;g.fill();g.clip();
    // Same diagonal screen inside the exact sign, printed in its opposite tone.
    const step=cell*83/logoWidth,stamp=(.13+.021*Math.sin(phase))*step;
    const sheen=g.createLinearGradient(0,52,83,0);
    sheen.addColorStop(0,dark?'#291e4caa':'#f0e8ff80');
    sheen.addColorStop(.58,dark?'#36264b52':'#fff8f050');
    sheen.addColorStop(1,dark?'#6c343059':'#ffe2cd60');
    g.fillStyle=sheen;g.beginPath();
    const bound=Math.ceil(51/step);
    for(let i=-bound;i<=bound;i++)for(let j=-bound;j<=bound;j++){
      const px=41.5+(i-j)*step*Math.SQRT1_2,py=28.5+(i+j)*step*Math.SQRT1_2;
      if(px>=0&&px<=83&&py>=0&&py<=57)dot(g,px,py,stamp*(.78+.36*hash(i,j)));
    }
    g.fill();
    const sweep=41.5+50*Math.cos(orbit);
    const gleam=g.createLinearGradient(sweep-11,0,sweep+11,0);
    gleam.addColorStop(0,dark?'#fff4e800':'#ffba9800');
    gleam.addColorStop(.5,dark?'#fff4e844':'#ffba9838');
    gleam.addColorStop(1,dark?'#fff4e800':'#ffba9800');
    g.fillStyle=gleam;g.fillRect(0,0,83,57);
    g.restore();
  }
  prepare();
  return {frame,resize,dispose(){dead=true;surface.dispose();}};
}

const GRID=26,GRID_SIZE=58,MARK_WIDTH=.705;
const MATRIX=[],FILM=[];
for(let y=-GRID;y<=GRID;y++)for(let x=-GRID;x<=GRID;x++){
  const px=x/GRID_SIZE,py=y/GRID_SIZE,dist=Math.hypot(px,py),edge=Math.max(Math.abs(px),Math.abs(py));
  const sx=px/MARK_WIDTH*83+41.5,sy=py/MARK_WIDTH*83+28.5;
  let coverage=0;
  for(const ox of [-1.4,0,1.4])for(const oy of [-1.4,0,1.4])coverage+=containsMark(sx+ox,sy+oy)?1/9:0;
  const seed=hash(x,y),theta=Math.atan2(py,px),variant=((x+2*y)%3+3)%3;
  const cell={px,py,dist,edge,coverage,seed,theta,variant,row:y,col:x};
  MATRIX.push(cell);
  if(Math.abs(sx-41.5)<43&&Math.abs(sy-28.5)<30.5)FILM.push(cell);
}
const GLYPHS=[
  [-.48,-.48, .26,-.48, .47,-.29, .47,-.05, .12,-.05, .12,.12, .47,.12, .47,.32, .28,.48, -.48,.48],
  [-.48,-.48, .47,-.48, .47,.48, -.23,.48, -.48,.25, -.48,.02, -.12,.02, -.12,-.14, -.48,-.14],
  [-.48,-.48, .48,-.48, .48,-.24, .19,-.24, .19,-.07, .48,-.07, .48,.48, -.48,.48, -.48,.23, -.22,.23, -.22,.06, -.48,.06]
];
function focusAt(t){
  const phase=(t+1.58)%8.7;
  if(phase<1.36)return lerp(.27,1,smooth(.21,1.36,phase));
  if(phase<5.75)return 1;
  if(phase<6.67)return lerp(1,.27,smooth(5.75,6.67,phase));
  return .27;
}
function microform(g,x,y,r,a,v){
  if(v===0){
    g.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r);
    g.arc(x,y,r,a,a+Math.PI*1.29);
  }else{
    const c=Math.cos(a)*r,s=Math.sin(a)*r;
    if(v===1){
      g.moveTo(x-c*.70-s*.62,y-s*.70+c*.62);
      g.lineTo(x+c*.54,y+s*.54);
      g.lineTo(x-c*.70+s*.62,y-s*.70-c*.62);
    }else{
      g.moveTo(x-c*.70-s*.63,y-s*.70+c*.63);
      g.lineTo(x-c*.70+s*.54,y-s*.70-c*.54);
      g.lineTo(x+c*.69+s*.54,y+s*.69-c*.54);
    }
  }
}

export async function createMatrixHero({el,signal,reduced=false,theme='light'}) {
  const surface=createStudySurface(el,signal),g=surface.g,dark=theme==='dark';
  surface.canvas.dataset.study='matrix';
  const animator=motion(reduced,2.85),palette=INK.matrix[dark?'dark':'light'];
  const bins=Array.from({length:18},()=>[]),tiles=Array.from({length:15},()=>[]);
  let dead=false;
  function resize(width,height){if(surface.resize(width,height))animator.resize();}
  function frame(time,dt,input={}){
    if(dead||signal?.aborted)return;
    const state=animator.read(time,input);if(!state)return;
    const {t,x,y,tx,ty,age}=state;
    const w=surface.width,h=surface.height,d=Math.max(1,Math.min(w*.97,h*1.03));
    g.clearRect(0,0,w,h);
    const cx=w*.5+x*d*.037,cy=h*.50+y*d*.037,step=d/GRID_SIZE;
    const tap=age>=0&&age<3.1?1-smooth(1.65,3.1,age):0;
    const focus=Math.max(focusAt(t),tap),formed=smooth(.30,1,focus),depth=1-formed;
    const sweep=fract(t*.34+.64)*1.40-.70;
    const waveX=(tx+1)*w*.5-cx,waveY=(ty+1)*h*.5-cy;
    const wave=age>=0&&age<1.6?1-smooth(.68,1.6,age):0;
    for(const group of bins)group.length=0;
    for(const p of MATRIX){
      const shift=Math.sin(16*p.dist-t*3.38+p.theta*1.55);
      const orbit=(p.theta+t*1.01)*depth;
      const spread=1+.15*depth*(1-p.coverage*.72);
      const dx=p.px*spread+.012*depth*shift*Math.cos(orbit),dy=p.py*spread+.012*depth*shift*Math.sin(orbit);
      const wavelet=wave?wave*Math.exp(-sq((Math.hypot(dx*d-waveX,dy*d-waveY)/d-age*.56)/.050)):0;
      const ring=Math.exp(-sq((p.dist-fract(.5+t*.22)*.56)/.068));
      const field=(1-smooth(.22,.48,p.edge))*(1-smooth(.36,.60,p.dist));
      const value=clamp(field*(.117+.31*depth)*(1+.23*shift)+p.coverage*(.048+.53*depth)+field*(.26*wavelet+.14*ring*depth));
      if(value<.041)continue;
      const radius=step*(.20+.19*depth+.12*p.coverage)*(.83+.17*p.seed)*(1+.18*shift*depth+.28*wavelet);
      if(radius<.27)continue;
      const angle=p.theta*(1.2+depth)+t*(.54+.3*p.seed)+depth*(shift*1.82+y*.9)+wavelet*1.8;
      const alpha=Math.min(5,Math.floor(value*7));
      const color=p.seed>.90?2:p.seed>.70?1:0;
      bins[color*6+alpha].push(cx+dx*d,cy+dy*d,radius,angle,p.variant);
    }
    g.lineCap='round';g.lineJoin='round';g.lineWidth=clamp(step*(.14+.045*depth),.53,1.75);
    bins.forEach((group,i)=>{
      if(!group.length)return;
      g.globalAlpha=.10+.158*(i%6);g.strokeStyle=palette[Math.floor(i/6)];g.beginPath();
      for(let j=0;j<group.length;j+=5)microform(g,group[j],group[j+1],group[j+2],group[j+3],group[j+4]);
      g.stroke();
    });
    g.globalAlpha=1;

    // Resolve into a mosaic of notched glyph plates. The mark is a clip only:
    // in every phase the individual cells, rather than a solid overlay, carry it.
    const width=d*MARK_WIDTH;
    g.save();mark(g,cx,cy,width);g.clip();
    g.setTransform(surface.dpr,0,0,surface.dpr,0,0);
    for(const group of tiles)group.length=0;
    for(const p of FILM){
      const line=p.px+.112*p.py-sweep;
      const beam=Math.exp(-sq(line/.077));
      const wavelet=wave?wave*Math.exp(-sq((Math.hypot(p.px*d-waveX,p.py*d-waveY)/d-age*.56)/.050)):0;
      const lock=clamp(formed+(.12*beam+.24*wavelet)*depth);
      const bit=(.57+.43*lock)*(.79+.21*p.seed)*(1+.11*beam*depth);
      const tilt=(1-lock)*(Math.sin(t*2.52+p.row*.52+p.col*.18)*.92+p.theta*.22);
      const cx0=cx+p.px*d,cy0=cy+p.py*d;
      const c=Math.cos(tilt)*step*bit,s=Math.sin(tilt)*step*bit;
      const alpha=Math.min(4,Math.floor(clamp(.16+.61*lock+.22*beam+.18*wavelet)*5));
      const band=p.seed>.84||wavelet>.43?2:p.seed>.63||beam>.42?1:0;
      tiles[band*5+alpha].push(cx0,cy0,c,s,p.variant);
    }
    tiles.forEach((group,i)=>{
      if(!group.length)return;
      g.globalAlpha=.25+.175*(i%5);
      g.fillStyle=palette[3+Math.floor(i/5)];
      g.beginPath();
      for(let j=0;j<group.length;j+=5){
        const x0=group[j],y0=group[j+1],c=group[j+2],s=group[j+3],v=GLYPHS[group[j+4]];
        g.moveTo(x0+v[0]*c-v[1]*s,y0+v[0]*s+v[1]*c);
        for(let k=2;k<v.length;k+=2)g.lineTo(x0+v[k]*c-v[k+1]*s,y0+v[k]*s+v[k+1]*c);
        g.closePath();
      }
      g.fill();
    });
    g.restore();
  }
  return {frame,resize,dispose(){dead=true;surface.dispose();}};
}
