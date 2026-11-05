import {traceMark} from './study-kit.js';

const ASPECT = 57 / 83;
const saturate = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {const f=saturate((x-a)/(b-a));return f*f*(3-2*f);};
const mix = (a,b,t) => a + (b-a)*t;
const bell = x => Math.exp(-x*x);
const power4 = x => x*x*x*x;
const power5 = x => power4(x)*x;
const power6 = x => power4(x)*x*x;
// The optical passes sample one exact mark. The Fresnel grooves and the
// lenticular facets change the sampling coordinates, never the source geometry.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uMark;
uniform vec2 uSize, uCenter;
uniform float uTime, uPress, uDark, uScale, uPrism, uEnergy, uSweep;
out vec4 outColor;

float mark(vec2 q) {
  vec2 v=q/vec2(1.,57./83.)+.5;
  return texture(uMark,v*.96+.02).r * step(0.,v.x)*step(0.,v.y)*step(v.x,1.)*step(v.y,1.);
}
float bell(float x){return exp(-x*x);}
vec3 splitInk(vec2 q,vec2 dispersion,float chroma){
  float middle=mark(q);
  return mix(vec3(middle),vec3(mark(q-dispersion),middle,mark(q+dispersion)),chroma);
}
void main(){
  vec2 p=(vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y)-uSize*.5)/uScale;
  vec3 paper=mix(vec3(.952,.960,.973),vec3(.043,.063,.110),uDark);
  vec3 ink=mix(vec3(.024,.032,.052),vec3(.895,.934,.994),uDark);
  float halo=1.-smoothstep(0.,.9,length(p*vec2(.92,1.15)));
  vec3 base=paper+halo*mix(vec3(.014,.014,.013),vec3(.008,.014,.028),uDark);
  vec3 c;
  if(uPrism<.5){
    c=mix(base,ink,mark(p));
    vec2 d=p-uCenter;
    float r=length(d), R=.344+.012*uPress;
    if(r<R+.024){
      vec2 n=d/max(r,.012), tangent=vec2(-n.y,n.x);
      float aperture=1.-smoothstep(.942,1.,r/R);
      float fold=r/R*4.35+.095*sin(uTime*.85);
      float i=floor(fold), f=fract(fold);
      float glassBand=bell((f-.63)*5.35);
      float glassEdge=bell((f-.672)*26.);
      float glassToe=bell((f-.735)*22.);
      float shape=(.20+.64*uEnergy+.18*uPress)*aperture*smoothstep(0.,.036,r);
      float orbit=sin(uTime*1.19-i*.72);
      vec2 bend=n*((-.013+.042*glassBand)*(.61+.39*orbit))+tangent*((.004+.034*glassBand)*orbit);
      vec2 q=p+bend*shape;
      vec2 dispersion=(n*.0068+tangent*.0023)*shape*(.22+.78*glassBand);
      vec3 a=splitInk(q,dispersion,.74);

      float key=clamp(.54-.39*n.x-.44*n.y,0.,1.);
      float glint=pow(clamp(.53-.72*n.x-.64*n.y,0.,1.),5.);
      float bounce=pow(clamp(.20+.55*n.x+.66*n.y,0.,1.),6.);
      float turn=clamp(.08+.62*n.x-.74*n.y,0.,1.);
      float spark=pow(turn,6.)*(.28+.72*pow(.5+.5*orbit,2.));
      float stripe=.021*glassBand + (.23+.14*uEnergy)*glassEdge;
      float gloss=(glint+.76*bounce+.43*spark)*stripe;
      float shade=glassToe*(.020+.039*key+.086*bounce);
      float interference=bell((f-.603)*32.)*(.58*glint+.35*spark);
      vec3 body=clamp(base+(key-.35)*mix(vec3(.026,.035,.052),vec3(.060,.114,.210),uDark)*.65,0.,1.);
      vec3 coat=mix(body,ink,a);
      coat+=gloss*mix(vec3(.50,.64,.83),vec3(.60,.77,.96),uDark);
      coat-=shade*mix(vec3(.44,.53,.67),vec3(.34,.48,.65),uDark);
      coat+=glassEdge*bounce*.082*mix(vec3(.96,.67,.31),vec3(.59,.67,1.),uDark);
      coat+=interference*mix(vec3(-.086,-.053,.008),vec3(.035,.114,.223),uDark);
      c=mix(c,coat,aperture);

      float rim=bell((r-R)*620.);
      float innerLip=bell((r-R+.0065)*445.);
      float shadow=bell((r-R-.010)*160.);
      c-=shadow*(.012+.014*bounce);
      c=mix(c,mix(vec3(.35,.44,.59),vec3(.36,.58,.86),uDark),rim*(.074+.19*bounce));
      c+=innerLip*(.035+.22*glint)*mix(vec3(.62,.72,.84),vec3(.55,.73,.98),uDark);
    }
  }else{
    float tilt=.196+uCenter.x*.45;
    float col=(p.x+tilt*p.y)/.0315;
    float f=fract(col),i=floor(col);
    float beam=p.x-uSweep+.20*p.y;
    float spread=bell(beam*5.9)*uEnergy;
    float highlight=bell((beam-.018)*14.5)*uEnergy;
    float swing=sin(i*.36-uTime*1.55+uCenter.y*4.);
    float face=f-.5;
    float strength=.25+.43*uEnergy+.38*spread+.24*uPress;
    vec2 q=p+vec2(face*.030+swing*.008,face*.079+.017*swing)*strength;
    vec2 dispersion=vec2(.0055,-.0092)*(strength*(.45+1.02*spread));
    vec3 a=splitInk(q,dispersion,.72);
    float tail=mark(q+vec2(-.005,.020)*strength)*(.10+.14*spread)
      +mark(q-vec2(-.005,.020)*strength)*(.07+.12*spread);
    float support=max(max(a.r,max(a.g,a.b)),tail);
    float ridge=bell((f-.055)*22.);
    float seam=bell((f-.947)*21.);
    float sheen=bell((f-.28)*4.5);
    float reflection=pow(.5+.5*cos(i*.36-uTime*1.65),3.);
    vec3 split=mix(base,ink,a);
    vec3 tint=mix(vec3(.21,.28,.39),vec3(.32,.47,.76),uDark);
    vec3 facet=mix(ink,tint,.10+.33*f+.14*reflection);
    c=mix(base,facet,tail*.30);
    c=mix(c,split,clamp(support*1.65,0.,1.));
    c=mix(c,facet,support*(.22+.19*f));
    c-=support*seam*mix(vec3(.036,.050,.076),vec3(.22,.30,.44),uDark)*(.32+.68*spread);
    c+=support*(ridge*(.29+.31*spread)+sheen*(.036+.22*spread))*mix(vec3(.52,.62,.79),vec3(.38,.56,.72),uDark);
    c+=support*ridge*spread*.16*mix(vec3(.60,.47,.24),vec3(.58,.38,.79),uDark);
    c+=support*highlight*(.12+.14*reflection+.15*ridge)*mix(vec3(.39,.59,.91),vec3(.20,.36,.67),uDark);
  }
  outColor=vec4(clamp(c,0.,1.),1.);
}`;

const VERTEX = `#version 300 es
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;

let maskCache;
function buildMask() {
  if(maskCache)return maskCache;
  const width=544,height=376,mask=document.createElement('canvas');
  mask.width=width;mask.height=height;
  const g=mask.getContext('2d',{willReadFrequently:true});
  g.setTransform(width*.96/83,0,0,height*.96/57,width*.02,height*.02);
  g.beginPath();traceMark(g);g.fillStyle='#fff';g.fill();
  const pixels=g.getImageData(0,0,width,height).data,values=new Uint8Array(width*height);
  for(let i=0;i<values.length;i++)values[i]=pixels[i*4+3];
  return maskCache={width,height,values};
}

function gpu(canvas,mask,dark,prism) {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'});
  if(!gl)throw new Error('No WebGL2');
  function shader(type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(msg);}
    return s;
  }
  const vertex=shader(gl.VERTEX_SHADER,VERTEX),fragment=shader(gl.FRAGMENT_SHADER,FRAGMENT);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const msg=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(msg);}
  gl.useProgram(program);
  const uniforms=Object.fromEntries(['uSize','uCenter','uTime','uPress','uDark','uScale','uPrism','uEnergy','uSweep','uMark'].map(n=>[n,gl.getUniformLocation(program,n)]));
  gl.uniform1f(uniforms.uDark,dark?1:0);gl.uniform1f(uniforms.uPrism,prism?1:0);
  const texture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,mask.width,mask.height,0,gl.RED,gl.UNSIGNED_BYTE,mask.values);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.uMark,0);
  return {
    resize(w,h){gl.viewport(0,0,w,h);gl.uniform2f(uniforms.uSize,w,h);},
    paint(scale,x,y,t,press,energy,sweep){
      gl.uniform2f(uniforms.uCenter,x,y);gl.uniform1f(uniforms.uScale,scale);gl.uniform1f(uniforms.uTime,t);gl.uniform1f(uniforms.uPress,press);gl.uniform1f(uniforms.uEnergy,energy);gl.uniform1f(uniforms.uSweep,sweep);
      gl.drawArrays(gl.TRIANGLES,0,3);
    },
    dispose(){gl.deleteTexture(texture);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  };
}

function cpu(canvas,mask,dark,prism) {
  const g=canvas.getContext('2d',{alpha:false});
  if(!g)throw new Error('No Canvas 2D');
  let frame,w,h,backdrop,baseField,oldScale;
  const paper=dark?[.043,.063,.110]:[.952,.960,.973],ink=dark?[.895,.934,.994]:[.024,.032,.052];
  const haloTint=dark?[.008,.014,.028]:[.014,.014,.013],lightTint=dark?[.060,.114,.210]:[.026,.035,.052];
  const glintInk=dark?[.60,.77,.96]:[.50,.64,.83],rimInk=dark?[.36,.58,.86]:[.35,.44,.59];
  const grooveShade=dark?[.34,.48,.65]:[.44,.53,.67],bounceInk=dark?[.59,.67,1]:[.96,.67,.31];
  const innerLipInk=dark?[.55,.73,.98]:[.62,.72,.84],interferenceInk=dark?[.035,.114,.223]:[-.086,-.053,.008];
  const prismTint=dark?[.32,.47,.76]:[.21,.28,.39],prismLip=dark?[.38,.56,.72]:[.52,.62,.79];
  const prismSeam=dark?[.22,.30,.44]:[.036,.050,.076],prismColor=dark?[.58,.38,.79]:[.60,.47,.24];
  const beamInk=dark?[.20,.36,.67]:[.39,.59,.91];
  const swingLut=new Float32Array(64),reflectionLut=new Float32Array(64),orbitLut=new Float32Array(6);
  const {width:mw,height:mh,values}=mask;
  function mark(x,y) {
    if(x<-.5||x>.5||Math.abs(y)>ASPECT*.5)return 0;
    const u=(x*.96+.5)*mw-.5,v=(y*.96/ASPECT+.5)*mh-.5;
    const i=u|0,j=v|0,a=u-i,b=v-j,at=j*mw+i;
    return mix(mix(values[at],values[at+1],a),mix(values[at+mw],values[at+mw+1],a),b)/255;
  }
  function resize(ww,hh){
    w=ww;h=hh;frame=g.createImageData(w,h);
    backdrop=new Uint8ClampedArray(w*h*4);baseField=new Float32Array(w*h*3);oldScale=-1;
  }
  function paint(scale,cx,cy,t,press,energy,sweep){
    const R=.344+.012*press,tilt=.196+cx*.45,ripple=.095*Math.sin(t*.85);
    const data=frame.data,invScale=1/scale;
    if(oldScale!==scale){
      for(let j=0,index=0;j<h;j++){
        const y=(j+.5-h*.5)*invScale,yHalo=(y*1.15)**2;
        for(let i=0;i<w;i++,index++){
          const x=(i+.5-w*.5)*invScale;
          const halo=1-smooth(0,.9,Math.sqrt((x*.92)**2+yHalo)),raw=prism?0:mark(x,y);
          for(let k=0;k<3;k++){
            const base=paper[k]+halo*haloTint[k];
            baseField[index*3+k]=base;
            backdrop[index*4+k]=255*mix(base,ink[k],raw);
          }
          backdrop[index*4+3]=255;
        }
      }
      oldScale=scale;
    }
    data.set(backdrop);
    if(prism){
      for(let i=-32;i<32;i++){
        swingLut[i+32]=Math.sin(i*.36-t*1.55+cy*4);
        reflectionLut[i+32]=(.5+.5*Math.cos(i*.36-t*1.65))**3;
      }
    }else{
      for(let i=-1;i<5;i++)orbitLut[i+1]=Math.sin(t*1.19-i*.72);
    }
    const r=R+.024,minX=prism?-.57:cx-r,maxX=prism?.57:cx+r;
    const minY=prism?-ASPECT*.5-.11:cy-r,maxY=prism?ASPECT*.5+.11:cy+r;
    const ix0=Math.max(0,Math.floor(w*.5+minX*scale)),ix1=Math.min(w,Math.ceil(w*.5+maxX*scale));
    const iy0=Math.max(0,Math.floor(h*.5+minY*scale)),iy1=Math.min(h,Math.ceil(h*.5+maxY*scale));
    for(let j=iy0;j<iy1;j++){
      const y=(j+.5-h*.5)*invScale;
      for(let i=ix0,index=j*w+ix0;i<ix1;i++,index++){
        const x=(i+.5-w*.5)*invScale,px=index*4,pigment=index*3;
        if(prism){
          const col=(x+tilt*y)/.0315,slat=Math.floor(col),f=col-slat;
          const beam=x-sweep+.20*y,spread=bell(beam*5.9)*energy;
          const swing=swingLut[slat+32],face=f-.5;
          const strength=.25+.43*energy+.38*spread+.24*press;
          const qx=x+(face*.030+swing*.008)*strength,qy=y+(face*.079+.017*swing)*strength;
          const dispersion=strength*(.45+1.02*spread);
          const sx=.0055*dispersion,sy=-.0092*dispersion;
          const middle=mark(qx,qy);
          const ar=mix(middle,mark(qx-sx,qy-sy),.72),ab=mix(middle,mark(qx+sx,qy+sy),.72);
          const tail=mark(qx-.005*strength,qy+.020*strength)*(.10+.14*spread)
            +mark(qx+.005*strength,qy-.020*strength)*(.07+.12*spread);
          const support=Math.max(ar,middle,ab,tail);
          if(support===0)continue;
          const ridge=bell((f-.055)*22),seam=bell((f-.947)*21),sheen=bell((f-.28)*4.5);
          const facetMix=.10+.33*f+.14*reflectionLut[slat+32];
          const splitWeight=saturate(support*1.65),facetWeight=support*(.22+.19*f);
          const darkEdge=support*seam*(.32+.68*spread),brightEdge=support*(ridge*(.29+.31*spread)+sheen*(.036+.22*spread));
          const spectrum=support*ridge*spread*.16;
          const keyBeam=support*bell((beam-.018)*14.5)*energy*(.12+.14*reflectionLut[slat+32]+.15*ridge);
          for(let k=0;k<3;k++){
            const a=k===0?ar:k===1?middle:ab;
            const base=baseField[pigment+k],facet=mix(ink[k],prismTint[k],facetMix);
            const c=mix(mix(base,facet,tail*.30),mix(base,ink[k],a),splitWeight);
            data[px+k]=255*(mix(c,facet,facetWeight)-darkEdge*prismSeam[k]+brightEdge*prismLip[k]+spectrum*prismColor[k]+keyBeam*beamInk[k]);
          }
        }else{
          const dx=x-cx,dy=y-cy,rr=dx*dx+dy*dy;
          if(rr>=r*r)continue;
          const rad=Math.sqrt(rr),nx=dx/Math.max(rad,.012),ny=dy/Math.max(rad,.012);
          const aperture=1-smooth(.942,1,rad/R),fold=rad/R*4.35+ripple,band=Math.floor(fold),f=fold-band;
          const glassBand=bell((f-.63)*5.35),glassEdge=bell((f-.672)*26),glassToe=bell((f-.735)*22);
          const shape=(.20+.64*energy+.18*press)*aperture*smooth(0,.036,rad),orbit=orbitLut[band+1];
          const radial=(-.013+.042*glassBand)*(.61+.39*orbit),angular=(.004+.034*glassBand)*orbit;
          const qx=x+(nx*radial-ny*angular)*shape,qy=y+(ny*radial+nx*angular)*shape;
          const spectrum=shape*(.22+.78*glassBand);
          const sx=(nx*.0068-ny*.0023)*spectrum,sy=(ny*.0068+nx*.0023)*spectrum;
          const middle=mark(qx,qy);
          const ar=mix(middle,mark(qx-sx,qy-sy),.74),ab=mix(middle,mark(qx+sx,qy+sy),.74);
          const key=saturate(.54-.39*nx-.44*ny);
          const glint=power5(saturate(.53-.72*nx-.64*ny)),bounce=power6(saturate(.20+.55*nx+.66*ny));
          const spark=power6(saturate(.08+.62*nx-.74*ny))*(.28+.72*(.5+.5*orbit)**2);
          const gloss=(glint+.76*bounce+.43*spark)*(.021*glassBand+(.23+.14*energy)*glassEdge);
          const shade=glassToe*(.020+.039*key+.086*bounce),reflection=glassEdge*bounce*.082;
          const interference=bell((f-.603)*32)*(.58*glint+.35*spark);
          const rim=bell((rad-R)*620)*(.074+.19*bounce);
          const innerLip=bell((rad-R+.0065)*445)*(.035+.22*glint),shadow=bell((rad-R-.010)*160)*(.012+.014*bounce);
          for(let k=0;k<3;k++){
            const a=k===0?ar:k===1?middle:ab;
            const base=baseField[pigment+k],body=saturate(base+(key-.35)*lightTint[k]*.65);
            const coat=mix(body,ink[k],a)+gloss*glintInk[k]-shade*grooveShade[k]+reflection*bounceInk[k]+interference*interferenceInk[k];
            const c=mix(backdrop[px+k]/255,coat,aperture)-shadow;
            data[px+k]=255*(mix(c,rimInk[k],rim)+innerLip*innerLipInk[k]);
          }
        }
      }
    }
    g.putImageData(frame,0,0);
  }
  return {resize,paint,dispose(){frame=backdrop=baseField=null;}};
}

async function createOpticalStudy({el,signal,reduced=false,theme='light'},prism) {
  if(signal?.aborted)throw new DOMException('Scene cancelled','AbortError');
  const mask=buildMask(),dark=theme==='dark';
  let canvas=document.createElement('canvas'), renderer, acceleration=true;
  try {renderer=gpu(canvas,mask,dark,prism);}
  catch {canvas=document.createElement('canvas');renderer=cpu(canvas,mask,dark,prism);acceleration=false;}
  canvas.className='optical-study-canvas';canvas.dataset.renderer=acceleration?'webgl':'canvas';
  canvas.dataset.effect=prism?'prism':'vortex';
  canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block',pointerEvents:'none'});
  el.append(canvas);
  let w=1,h=1,scale=1,x=0,y=0,last=-1,pressAt=-10,dirty=true,disposed=false;
  function resize(width,height){
    if(disposed)return;
    width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
    const ratio=Math.min(globalThis.devicePixelRatio||1,acceleration?1.75:1.25,1600/width,1200/height,Math.sqrt((acceleration?1450000:210000)/(width*height)));
    w=Math.max(1,Math.round(width*ratio));h=Math.max(1,Math.round(height*ratio));
    if(w!==canvas.width)canvas.width=w;
    if(h!==canvas.height)canvas.height=h;
    scale=Math.max(1,Math.min(w*(prism?.79:.81),h*(prism?1.12:.98)));
    renderer.resize(w,h);dirty=true;
  }
  function frame(time,dt=0,input={}){
    if(disposed)return;
    const t=reduced?.45:Math.max(0,Number(time)||0);
    if(t<last){x=y=0;pressAt=-10;dirty=true;}
    if(!dirty&&t===last&&(reduced||!input.pressed))return;
    if(!acceleration&&!dirty&&last>=0&&t-last<.027&&!input.pressed)return;
    const pointing=!reduced&&(input.active||input.dragging);
    const follow=last<0||reduced?1:1-Math.exp(-8*Math.min(.085,Math.max(dt,t-last)));
    const offsetX=pointing?Math.max(-1,Math.min(1,Number(input.x)||0)):0;
    const offsetY=pointing?Math.max(-1,Math.min(1,Number(input.y)||0)):0;
    x=mix(x,offsetX*(prism?.16:.295),follow);y=mix(y,offsetY*(prism?.2:.196),follow);
    if(input.pressed&&!reduced)pressAt=t;
    const age=t-pressAt,press=reduced||age<0?0:Math.exp(-2.8*age);
    // The optical action crosses the mark, settles, then leaves a calm read.
    const phase=t%9.4;
    const energy=reduced?0:smooth(.72,2.48,phase)*(1-smooth(3.95,6.13,phase));
    const sweep=mix(-.77,.78,smooth(.65,5.9,phase))+(prism?x*.72:0);
    const crossing=mix(-.070,.075,smooth(1.1,5.2,phase))*energy;
    renderer.paint(scale,x+(prism?0:-.026+Math.sin(t*.44)*.038+crossing),y+(prism?0:Math.cos(t*.39)*.025),t,press,energy,sweep);
    last=t;dirty=false;
  }
  function dispose(){
    if(disposed)return;disposed=true;
    signal?.removeEventListener('abort',dispose);renderer.dispose();canvas.remove();canvas.width=canvas.height=1;
  }
  signal?.addEventListener('abort',dispose,{once:true});
  const box=el.getBoundingClientRect();resize(box.width,box.height);
  return {frame,resize,dispose};
}

export const createVortexHero=opts=>createOpticalStudy(opts,false);
export const createPrismHero=opts=>createOpticalStudy(opts,true);
