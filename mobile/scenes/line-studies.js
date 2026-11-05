import {containsMark, createStudySurface, MARK_OUTLINES, traceMark} from './study-kit.js';

const TAU = Math.PI * 2;
const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = x => { const t = clamp(x); return t*t*(3-2*t); };
function rng(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// The host supplies the shared playback clock. No scene runs a second RAF.
function animatedStudy(surface, signal, reduced, idle, render) {
  let last = -1, dirty = true, dead = false, mx = 0, my = 0, engaged = 0, pressedAt = -100, pressX = 0, pressY = 0;
  return {
    resize(w, h) { if (!dead && surface.resize(w,h)) dirty = true; },
    dispose() { dead = true; surface.dispose(); },
    frame(time, dt, input = {}) {
      if (dead || signal?.aborted) return;
      const t = reduced ? idle : Math.max(0, Number(time) || 0);
      if (t < last) { mx = my = engaged = 0; pressedAt = -100; dirty = true; }
      if (!dirty && t === last && (reduced || !input.pressed)) return;
      if (!reduced && input.pressed) {
        pressedAt = t;
        pressX = clamp(Number(input.pressX ?? input.x) || 0, -1, 1);
        pressY = clamp(Number(input.pressY ?? input.y) || 0, -1, 1);
      }
      const step = last < 0 ? Math.min(.07,dt || 0) : Math.min(.07,Math.max(0,t-last));
      const active = !reduced && (input.active || input.dragging);
      const follow = 1 - Math.exp(-step * 6.2);
      mx = mix(mx, active ? clamp(input.x || 0,-1,1) : 0, follow);
      my = mix(my, active ? clamp(input.y || 0,-1,1) : 0, follow);
      engaged = mix(engaged, active ? 1 : 0, follow);
      const {g,width:w,height:h} = surface;
      g.clearRect(0,0,w,h);
      render(g,w,h,{t,mx,my,engaged,age:t-pressedAt,pressX,pressY});
      last = t;
      dirty = false;
    }
  };
}

function wash(g, x, y, radius, stops) {
  const colour = g.createRadialGradient(x,y,0,x,y,radius);
  stops.forEach(([offset,ink]) => colour.addColorStop(offset,ink));
  g.fillStyle = colour;
}

const FIBRE = {
  dark: {
    threads:[[0,'#a6ceff16'],[.45,'#bbd9ff1e'],[.72,'#b6d6ff50'],[1,'#def1ffb0']],
    faces:[[0,'#a6d4ff1e'],[.54,'#4383cf12'],[1,'#70a6fc33']],
    ambient:[[0,'#3566af35'],[.6,'#294f9620'],[1,'#1e448c00']],
    glow:[[0,'#f3ffffdf'],[.09,'#a5e4ffa1'],[.26,'#73afff49'],[1,'#4283ff00']],
    side:'#7bbdff24', edge:'#e1f4ffc6', back:'#6b9ad544',
    dim:'#9cc9f7a1', terminal:'#eaf8ffef', pulse:'#efffff', focal:'#ffffff'
  },
  light: {
    threads:[[0,'#12346612'],[.45,'#28558c26'],[.72,'#2d5a9b60'],[1,'#174887b4']],
    faces:[[0,'#1753a41b'],[.54,'#296cc610'],[1,'#316dc930']],
    ambient:[[0,'#abc8fa66'],[.6,'#b8d0fa26'],[1,'#b8d0fa00']],
    glow:[[0,'#1843888c'],[.09,'#4f8de670'],[.26,'#75a8ff4c'],[1,'#5f96fb00']],
    side:'#3879c637', edge:'#123b73c9', back:'#4a72ac52',
    dim:'#3264a5a1', terminal:'#164577e9', pulse:'#1553a7', focal:'#113665'
  }
};
const world = (x,y,z) => [(x-41.5)*5.2/83,(28.5-y)*5.2/83,z];
const profile = MARK_OUTLINES.map(outline => ({
  front:outline.map(([x,y])=>world(x,y,.19)),
  back:outline.map(([x,y])=>world(x,y,-.19))
}));

function fibreTerminals() {
  const rand = rng(786394), points = [];
  const add = (x,y,z,edge) => {
    const salt=rand();
    points.push({v:world(x,y,z),edge,salt,ray:edge?rand()<.75:rand()<.48,size:.52+rand()**2*.74});
  };
  for(let y=1.1;y<57;y+=1.78)for(let x=.9;x<83;x+=1.78){
    const xx=x+(rand()-.5)*.48,yy=y+(rand()-.5)*.48;
    if(containsMark(xx,yy))add(xx,yy,.193,false);
  }
  for(const outline of MARK_OUTLINES)for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const [x0,y0]=outline[j],[x1,y1]=outline[i];
    const n=Math.max(1,Math.round(Math.hypot(x1-x0,y1-y0)/1.5));
    for(let k=0;k<n;k++){
      const u=(k+.15)/n,x=mix(x0,x1,u),y=mix(y0,y1,u);
      add(x,y,.194,true);
      if(k%3===1)add(x,y,-.19,false);
    }
  }
  return points;
}
const terminals=fibreTerminals();

function gradient(g,x0,y0,x1,y1,stops){
  const ramp=g.createLinearGradient(x0,y0,x1,y1);
  for(const [offset,ink] of stops)ramp.addColorStop(offset,ink);
  return ramp;
}
function projectShape(g,points,project) {
  const [x,y]=project(points[0]);
  g.moveTo(x,y);
  for(let i=1;i<points.length;i++)g.lineTo(...project(points[i]));
  g.closePath();
}
function quadraticPoint(x0,y0,cx,cy,x1,y1,u) {
  const k=1-u;
  return [k*k*x0+2*k*u*cx+u*u*x1,k*k*y0+2*k*u*cy+u*u*y1];
}

export async function createFiberHero({el,signal,reduced=false,theme='light'}) {
  const surface=createStudySurface(el,signal);
  surface.canvas.dataset.effect='fiber';
  const ink=FIBRE[theme==='dark'?'dark':'light'];
  const mapped=terminals.map(()=>[0,0]);
  return animatedStudy(surface,signal,reduced,3.4,(g,w,h,{t,mx,my,engaged,age,pressX,pressY})=>{
    const short=Math.min(w,h);
    const scale=Math.min(w*.773/5.2,h*.50/(57*5.2/83));
    const cx=w*.50, cy=h*.395;
    const loop=t%11.2;
    const reveal=smooth(loop/2.05)*(1-smooth((loop-8.9)/2.3));
    const pulse=age<1.75?smooth(age/.13)*(1-smooth((age-.23)/1.52)):0;
    const connect=clamp(reveal+engaged*.53+pulse*.65);
    const fx=clamp(w*(.50+.019*Math.sin(t*.62)+.155*mx+.09*pressX*pulse),w*.24,w*.76);
    const fy=clamp(h*(.802+.012*Math.sin(t*.86)+.078*my+.045*pressY*pulse),h*.69,h*.905);
    const yaw=-.105+.047*Math.sin(t*.56)+mx*.24, tilt=.128+.032*Math.cos(t*.65)+my*.133;
    const sy=Math.sin(yaw),cc=Math.cos(yaw),sx=Math.sin(tilt),cp=Math.cos(tilt);
    const project=(v,out=[])=>{
      const [x,y,z]=v,xx=x*cc+z*sy,zz=z*cc-x*sy;
      const zy=y*sx+zz*cp, perspective=8.5/(8.5-zy);
      out[0]=cx+xx*scale*perspective;out[1]=cy-(y*cp-zz*sx)*scale*perspective;
      return out;
    };
    const dot=clamp(short/360,.75,1.47), halfHeight=scale*57*5.2/166;
    wash(g,mix(cx,fx,.22),mix(cy,fy,.37),short*.65,ink.ambient);
    g.fillRect(0,0,w,h);
    for(let i=0;i<terminals.length;i++)project(terminals[i].v,mapped[i]);

    // The thin beam field is brightest below the mark. Within the sign it is
    // subdued, so the angular breaks between the three parts remain readable.
    g.strokeStyle=gradient(g,0,cy-halfHeight*.62,0,fy,ink.threads);
    g.lineWidth=.62;g.lineCap='round';g.beginPath();
    for(let i=0;i<terminals.length;i++){
      const p=terminals[i];if(!p.ray)continue;
      const [x,y]=mapped[i],bx=mix(fx,x,.47)-mx*3,by=mix(fy,y,.51);
      const u=p.edge&&p.salt>.73?1:.42+.58*smooth(connect*1.22-p.salt*.18);
      const [tx,ty]=quadraticPoint(fx,fy,bx,by,x,y,u);
      g.moveTo(fx,fy);g.quadraticCurveTo(mix(fx,bx,u),mix(fy,by,u),tx,ty);
    }
    g.stroke();

    // The original three paths form an actual shallow extrusion; the back and
    // side plates reinforce the edge only, leaving the fine terminal field visible.
    g.lineJoin='round';g.lineWidth=.65;g.fillStyle=ink.side;
    for(const {front,back} of profile){
      g.beginPath();projectShape(g,back,project);g.strokeStyle=ink.back;g.stroke();
      g.beginPath();
      for(let i=0,j=front.length-1;i<front.length;j=i++)projectShape(g,[front[j],front[i],back[i],back[j]],project);
      g.fill();
    }
    g.fillStyle=gradient(g,0,cy-halfHeight,0,cy+halfHeight,ink.faces);
    g.strokeStyle=ink.edge;g.lineWidth=.77;
    g.globalAlpha=.85+.15*connect;
    g.beginPath();for(const {front} of profile)projectShape(g,front,project);g.fill();g.stroke();
    g.globalAlpha=1;

    for(let band=0;band<2;band++){
      g.fillStyle=band?ink.terminal:ink.dim;g.beginPath();
      for(let i=0;i<terminals.length;i++){
        const p=terminals[i];if((p.edge||p.salt>.75)!==Boolean(band))continue;
        const [x,y]=mapped[i],r=dot*p.size*(p.edge?.91:.80);
        g.moveTo(x+r,y);g.arc(x,y,r,0,TAU);
      }
      g.fill();
    }

    // Narrow pulses propagate from the convergent point through the same fibres.
    g.fillStyle=ink.pulse;g.beginPath();
    for(let i=0;i<terminals.length;i+=2){
      const p=terminals[i];if(!p.ray)continue;
      const u=pulse>0?age*.77-p.salt*.18:(t*.20+p.salt)%1;
      const range=p.edge&&p.salt>.73?1:.42+.58*smooth(connect*1.22-p.salt*.18);
      if(u<.08||u>range||u>.97||(!pulse&&p.salt<.60))continue;
      const [x,y]=mapped[i];
      const [sx,sy]=quadraticPoint(fx,fy,mix(fx,x,.47)-mx*3,mix(fy,y,.51),x,y,u);
      const r=dot*(.50+(pulse*.52+p.salt*.22));g.moveTo(sx+r,sy);g.arc(sx,sy,r,0,TAU);
    }
    g.globalAlpha=.69+.31*pulse;g.fill();g.globalAlpha=1;

    // A narrow packet climbs the complete bundle, including the upper tips.
    const flight=pulse>0?age*.91:(loop-.23)/1.69;
    const flightFade=smooth(flight/.17)*(1-smooth((flight-.78)/.26));
    if(flightFade>0){
      g.strokeStyle=ink.pulse;g.globalAlpha=flightFade*(pulse>0?.60:.44);g.lineWidth=.75;
      g.beginPath();
      for(let i=0;i<terminals.length;i+=2){
        const p=terminals[i];if(!p.ray||p.salt<.33)continue;
        const u=flight-p.salt*.065,[x,y]=mapped[i];
        const limit=p.edge&&p.salt>.73?1:.42+.58*smooth(connect*1.22-p.salt*.18);
        if(u<.08||u>limit)continue;
        const bx=mix(fx,x,.47)-mx*3,by=mix(fy,y,.51);
        g.moveTo(...quadraticPoint(fx,fy,bx,by,x,y,Math.max(.03,u-.046)));
        g.lineTo(...quadraticPoint(fx,fy,bx,by,x,y,u));
      }
      g.stroke();g.globalAlpha=1;
    }

    const radius=12+short*.025+pulse*short*.04;
    wash(g,fx,fy,radius,ink.glow);g.fillRect(fx-radius,fy-radius,radius*2,radius*2);
    g.fillStyle=ink.focal;g.beginPath();g.arc(fx,fy,1.65+pulse,0,TAU);g.fill();
    g.strokeStyle=ink.edge;g.lineWidth=.65;g.globalAlpha=.30+pulse*.27;
    g.beginPath();g.arc(fx,fy,6+3*connect+9*pulse,0,TAU);g.stroke();g.globalAlpha=1;
  });
}

const PLOTTER = {
  dark:{
    grid:'#a4bde44a', guide:'#b1cff693', face:'#82b4ff17',
    thread:'#c7ddff69', quiet:'#c0d9f9d6', print:'#f8fcff', edge:'#eff6fff0', head:'#b4f5ff',
    wash:[[0,'#4068ae26'],[.62,'#2b54aa17'],[1,'#2b54aa00']]
  },
  light:{
    grid:'#43638c3d', guide:'#31578078', face:'#2b5a9c0c',
    thread:'#20437356', quiet:'#163461dc', print:'#102746', edge:'#0e2445fa', head:'#126f9a',
    wash:[[0,'#bad0f551'],[.62,'#b8cef520'],[1,'#b8cef500']]
  }
};

function columns(step) {
  const spans=[];
  for(let x=.68;x<83;x+=step)for(const outline of MARK_OUTLINES){
    const intersections=[];
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
      const [a,ay]=outline[j],[b,by]=outline[i];
      if((a>x)!==(b>x))intersections.push(ay+(by-ay)*(x-a)/(b-a));
    }
    intersections.sort((a,b)=>a-b);
    for(let i=0;i+1<intersections.length;i+=2){
      const a=intersections[i],b=intersections[i+1];
      if(b-a>.42)spans.push({x,a,b,count:Math.max(2,Math.ceil((b-a)/1.19))});
    }
  }
  return spans;
}
const narrow=columns(1.62),wide=columns(1.27);
const outlineDots=MARK_OUTLINES.flatMap(outline=>outline.flatMap(([x,y],i)=>{
  const [a,b]=outline[(i+1)%outline.length],n=Math.max(1,Math.ceil(Math.hypot(a-x,b-y)/.76));
  return Array.from({length:n},(_,j)=>[mix(x,a,j/n),mix(y,b,j/n)]);
}));

export async function createPlotterHero({el,signal,reduced=false,theme='light'}) {
  const surface=createStudySurface(el,signal);
  surface.canvas.dataset.effect='plotter';
  const dark=theme==='dark',ink=PLOTTER[dark?'dark':'light'];
  const dots=[[],[],[]];
  return animatedStudy(surface,signal,reduced,2.9,(g,w,h,{t,mx,my,engaged,age,pressX,pressY})=>{
    const short=Math.min(w,h),scale=Math.min(w*.792/83,h*.65/57);
    const left=(w-83*scale)*.5, top=(h-57*scale)*.49;
    const px=x=>left+x*scale, py=y=>top+y*scale;
    const pass=t%12.2, cycle=pass*TAU/12.2;
    const travel=smooth(pass/4.5);
    const returnAt=smooth((pass-9.1)/3.1);
    const auto=mix(-9,92,travel*(1-returnAt));
    const energy=smooth((pass-.3)/1.25)*(1-smooth((pass-7.0)/2.25));
    const pulse=age<1.7?smooth(age/.14)*(1-smooth((age-.67)/1.03)):0;
    const start=(pressX+1)*41.5,dir=pressX>.28?-1:1;
    const head=mix(mix(auto,41.5+mx*47,engaged*.88),start+dir*age*53,pulse*.92);
    const strength=.78+energy*1.43+engaged*.62+pulse*2.25;
    const lanes=scale<4.3?narrow:wide;

    wash(g,w*.51,h*.49,short*.64,ink.wash);g.fillRect(0,0,w,h);
    const pad=clamp(scale*4,10,27),r0=py(0)-pad,r1=py(57)+pad;
    g.strokeStyle=ink.grid;g.lineWidth=.66;g.beginPath();
    for(const y of [r0,r1]){
      g.moveTo(px(-2),y);g.lineTo(px(85),y);
      for(let i=0;i<=16;i++){
        const x=px(i*83/16);g.moveTo(x,y);g.lineTo(x,y+(y===r0?-1:1)*(i%4===0?5:2.45));
      }
    }
    g.stroke();

    // The plot follows the real three-part outline. The interior filaments flex
    // against its edges without erasing the central and side counterforms.
    g.save();
    g.translate(left,top);g.scale(scale,scale);g.beginPath();traceMark(g);
    g.fillStyle=ink.face;g.fill();g.clip();
    g.scale(1/scale,1/scale);g.translate(-left,-top);
    g.strokeStyle=ink.thread;g.lineWidth=dark?.64:.56;g.beginPath();
    for(const bin of dots)bin.length=0;
    for(const {x,a,b,count} of lanes){
      const focus=Math.exp(-((x-head)*(x-head))/90);
      const tracePhase=cycle*3+x*.084;
      for(let j=0;j<=count;j++){
        const u=j/count,y=mix(a,b,u);
        const pin=Math.sin(Math.PI*u)**.64;
        const breath=(Math.sin(y*.177-tracePhase)+.41*Math.sin(y*.34+cycle*2+x*.071))*strength;
        const ripple=Math.sin((y-28.5*pressY)*.55-age*9)*pulse*.53;
        const sx=px(x+pin*(breath*(.55+.81*focus)+ripple)),sy=py(y);
        if(j===0)g.moveTo(sx,sy);else g.lineTo(sx,sy);
        const trailing=clamp((head-x)/19+.45),beat=.5+.5*Math.cos(y*.62-cycle*6+x*.142);
        const tone=focus*.65+trailing*.23+beat*.24;
        dots[tone>.82?2:tone>.48?1:0].push(sx,sy);
      }
    }
    g.stroke();
    for(let i=0;i<3;i++){
      g.fillStyle=i===2?ink.print:i===1?ink.quiet:ink.guide;
      const radius=clamp(scale*((dark?.162:.135)+i*.036),(dark?.53:.46)+i*.04,1.24+i*.25);
      g.beginPath();
      for(let j=0;j<dots[i].length;j+=2){const x=dots[i][j],y=dots[i][j+1];g.moveTo(x+radius,y);g.arc(x,y,radius,0,TAU);}
      g.fill();
    }
    g.restore();
    const radius=clamp(scale*(dark?.165:.145),dark?.57:.51,1.16);
    g.fillStyle=ink.edge;g.beginPath();
    for(const [x,y] of outlineDots){const u=px(x),v=py(y);g.moveTo(u+radius,v);g.arc(u,v,radius,0,TAU);}
    g.fill();

    const at=px(clamp(head,-2,85)),stylus=clamp(scale*.46,1.4,3.05);
    g.strokeStyle=ink.head;g.lineWidth=.79;g.globalAlpha=.64+.33*pulse;
    g.beginPath();g.moveTo(at,r0+3);g.lineTo(at,r0+pad*.77);g.moveTo(at,r1-3);g.lineTo(at,r1-pad*.77);g.stroke();
    g.globalAlpha=.34+.31*pulse;
    g.beginPath();g.arc(at,r0,stylus+3.2,0,TAU);g.moveTo(at+stylus+3.2,r1);g.arc(at,r1,stylus+3.2,0,TAU);g.stroke();
    g.globalAlpha=1;g.fillStyle=ink.head;
    g.beginPath();g.arc(at,r0,stylus,0,TAU);g.moveTo(at+stylus,r1);g.arc(at,r1,stylus,0,TAU);g.fill();
  });
}
