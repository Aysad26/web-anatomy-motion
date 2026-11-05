// Coordinates from the three flat outlines in assets/logo-sign.svg (83 × 57).
export const MARK_OUTLINES = [
  [[59.0627,56.9996],[60.4419,54.0835],[72.7029,28.2895],[60.4419,2.49557],[59.2622,.000366211],[69.556,.000366211],[83.0001,28.2895],[69.3531,56.9996]],
  [[13.647,57],[0,28.2899],[13.4476,.000732422],[23.7379,.000732422],[22.5582,2.49594],[10.2972,28.2899],[22.5582,54.0838],[23.9373,57]],
  [[49.4704,56.9996],[41.5016,24.4262],[33.5328,56.9996],[23.9407,56.9996],[37.8835,.000366211],[45.1232,.000366211],[59.066,56.9996],[49.4738,56.9996]]
];
export function containsMark(x,y){
  if(x<0||x>83||y<0||y>57)return false;
  for(const path of MARK_OUTLINES){
    let inside=false;
    for(let i=0,j=path.length-1;i<path.length;j=i++){
      const [a,b]=path[i],[c,d]=path[j];
      if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
    }
    if(inside)return true;
  }
  return false;
}
export function traceMark(g){
  for(const path of MARK_OUTLINES){
    g.moveTo(...path[0]);
    for(let i=1;i<path.length;i++)g.lineTo(...path[i]);
    g.closePath();
  }
}
export function createStudySurface(el,signal){
  if(signal?.aborted)throw new DOMException('Scene cancelled','AbortError');
  const canvas=document.createElement('canvas');
  const g=canvas.getContext('2d',{alpha:true});
  if(!g)throw new Error('Canvas 2D unavailable');
  canvas.className='study-canvas';canvas.dataset.renderer='canvas';
  canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
  el.append(canvas);
  let width=0,height=0,dpr=1,dead=false;
  function resize(w,h){
    if(dead)return false;
    const nextW=Math.max(1,Number(w)||1),nextH=Math.max(1,Number(h)||1);
    const ratio=Math.min(globalThis.devicePixelRatio||1,1.8,1440/nextW,1050/nextH);
    if(nextW===width&&nextH===height&&ratio===dpr)return false;
    width=nextW;height=nextH;dpr=ratio;
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    g.setTransform(dpr,0,0,dpr,0,0);
    return true;
  }
  function dispose(){
    if(dead)return;
    dead=true;signal?.removeEventListener('abort',dispose);
    canvas.remove();canvas.width=canvas.height=1;
  }
  signal?.addEventListener('abort',dispose,{once:true});
  const box=el.getBoundingClientRect();resize(box.width,box.height);
  return {canvas,g,resize,dispose,get width(){return width;},get height(){return height;},get dpr(){return dpr;}};
}
