import * as THREE from '../../vendor/three.module.min.js';

const DEG=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Low enough that the island reads as a place with the sea running out behind it, high enough to read every pad.
export const VIEW={azimuth:45*DEG,elevation:38*DEG,zoom:1};
const LIMITS={elevation:[12*DEG,80*DEG],zoom:[.42,1.45],x:[-7,6],z:[-5.5,5.5]};

// Orbit camera with damping. Pointer drags rotate (right button or two fingers pan), wheel and pinch zoom.
export class CameraRig {
  constructor(camera,element,fitPoints) {
    this.camera=camera;this.element=element;this.fitPoints=fitPoints;
    this.home=new THREE.Vector3(0,.3,0);this.target=this.home.clone();this.goalTarget=this.home.clone();
    this.azimuth=VIEW.azimuth;this.elevation=VIEW.elevation;this.zoom=VIEW.zoom;this.goal={...VIEW};this.fit=20;
    this.trauma=0;this.time=0;this.intro=0;this.pointers=new Map();this.suppressClick=false;this.enabled=true;
    this.insets={top:0,right:0,bottom:0,left:0};this.bounds={x0:-.97,x1:.97,y0:-.95,y1:.93};this.shot=null;this.saved=null;this.soft=0;
    this.offset=new THREE.Vector3();this.look=new THREE.Vector3();this.tmp=new THREE.Vector3();
    const on=(type,fn,opts)=>{element.addEventListener(type,fn,opts);(this.off||=[]).push(()=>element.removeEventListener(type,fn,opts));};
    on('pointerdown',e=>this.down(e));on('pointermove',e=>this.move(e));on('pointerup',e=>this.up(e));on('pointercancel',e=>this.up(e,true));
    on('wheel',e=>{if(!this.enabled)return;e.preventDefault();this.interrupt();this.goal.zoom=clamp(this.goal.zoom*Math.exp(e.deltaY*.0011),...LIMITS.zoom);},{passive:false});
    on('contextmenu',e=>e.preventDefault());
  }
  // Any direct input takes the camera back from the intro or a cinematic shot.
  // A passing shot hands back the player's own framing; the closing shot of a watch simply stops where it is.
  interrupt(){
    this.intro=0;if(!this.shot)return;
    const v=!this.shot.stay&&this.saved;this.shot=null;this.saved=null;
    if(v){Object.assign(this.goal,{azimuth:this.nearestAzimuth(v.azimuth),elevation:v.elevation,zoom:v.zoom});this.goalTarget.fromArray(v.target);this.soft=1.2;}
  }
  cancelIntro(){this.interrupt();}
  // A short cinematic move. It hands the view back afterwards unless it is the final word of a watch.
  play(view,{hold=2.4,rate=2.2,stay=false}={}) {
    if(this.calm)return;
    if(!this.shot)this.saved=this.snapshot();
    if(view.azimuth!==undefined)this.goal.azimuth=this.nearestAzimuth(view.azimuth);
    if(view.elevation!==undefined)this.goal.elevation=view.elevation;
    if(view.zoom!==undefined)this.goal.zoom=view.zoom;
    if(view.target)this.goalTarget.copy(view.target);
    this.intro=0;this.shot={t:0,hold,rate,stay};
  }
  playIntro() {
    this.azimuth=this.goal.azimuth-1.25;this.elevation=13*DEG;this.zoom=2.6;this.intro=3.4;
  }
  // During a cinematic shot the player's own view is the one worth keeping.
  snapshot(){if(this.saved)return {...this.saved,target:[...this.saved.target]};return {azimuth:this.goal.azimuth,elevation:this.goal.elevation,zoom:this.goal.zoom,target:this.goalTarget.toArray()};}
  restore(view){this.shot=null;this.saved=null;Object.assign(this.goal,{azimuth:view.azimuth,elevation:view.elevation,zoom:view.zoom});this.goalTarget.fromArray(view.target);
    this.azimuth=view.azimuth;this.elevation=view.elevation;this.zoom=view.zoom;this.target.copy(this.goalTarget);this.intro=0;}
  reset(){this.cancelIntro();Object.assign(this.goal,{...VIEW,azimuth:this.nearestAzimuth(VIEW.azimuth)});this.goalTarget.copy(this.home);}
  nearestAzimuth(a){return a+Math.round((this.goal.azimuth-a)/(Math.PI*2))*Math.PI*2;}
  rotate(steps){this.cancelIntro();this.goal.azimuth+=steps*Math.PI/4;}
  zoomBy(steps){this.cancelIntro();this.goal.zoom=clamp(this.goal.zoom*Math.pow(.84,steps),...LIMITS.zoom);}
  shake(amount){if(!this.calm)this.trauma=Math.min(1,this.trauma+amount);}
  down(e) {
    if(!this.enabled)return;
    this.interrupt();
    if(this.pointers.size===0)this.suppressClick=false;
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,button:e.button,type:e.pointerType,pan:e.button===2||e.button===1||e.shiftKey||e.ctrlKey,dragging:false});
    if(e.button===2||e.button===1)e.preventDefault();
    this.element.setPointerCapture?.(e.pointerId);
    if(this.pointers.size===2)this.pinch=this.pinchState();
  }
  pinchState(){const [a,b]=[...this.pointers.values()];return {d:Math.hypot(a.x-b.x,a.y-b.y),a:Math.atan2(b.y-a.y,b.x-a.x),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  move(e) {
    const p=this.pointers.get(e.pointerId);if(!p)return;
    const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(!p.dragging&&Math.hypot(p.x-p.sx,p.y-p.sy)>(p.type==='touch'?10:5)){p.dragging=true;this.cancelIntro();}
    if(!p.dragging)return;
    if(this.pointers.size>=2&&this.pinch) {
      const next=this.pinchState();
      if(next.d>10&&this.pinch.d>10)this.goal.zoom=clamp(this.goal.zoom*this.pinch.d/next.d,...LIMITS.zoom);
      let da=next.a-this.pinch.a;if(da>Math.PI)da-=Math.PI*2;if(da<-Math.PI)da+=Math.PI*2;this.goal.azimuth+=da;
      this.pan(next.x-this.pinch.x,next.y-this.pinch.y);this.pinch=next;return;
    }
    if(p.pan)this.pan(dx,dy);
    else{this.goal.azimuth+=dx*.0075;this.goal.elevation=clamp(this.goal.elevation+dy*.005,...LIMITS.elevation);}
  }
  pan(dx,dy) {
    const s=this.fit*this.zoom*.0013,a=this.azimuth;
    this.goalTarget.x=clamp(this.goalTarget.x-Math.sin(a)*dx*s-Math.cos(a)*dy*s,...LIMITS.x);
    this.goalTarget.z=clamp(this.goalTarget.z+Math.cos(a)*dx*s-Math.sin(a)*dy*s,...LIMITS.z);
  }
  up(e,cancel=false) {
    const p=this.pointers.get(e.pointerId);if(!p)return;
    if(p.dragging&&!cancel)this.suppressClick=true;
    this.pointers.delete(e.pointerId);this.pinch=this.pointers.size===2?this.pinchState():null;
  }
  // The browser still fires "click" after a drag; the app asks once per click whether to ignore it.
  consumeClick(){const s=this.suppressClick;this.suppressClick=false;return s;}
  dragging(){for(const p of this.pointers.values())if(p.dragging)return true;return false;}
  setInsets(insets){this.insets={top:0,right:0,bottom:0,left:0,...insets};}
  resize(w,h) {
    // The HUD covers the edges of the screen: shift the image so the island sits in the open space between the bars.
    const i=this.insets,dx=(i.left-i.right)/2,dy=(i.top-i.bottom)/2;
    this.camera.aspect=w/h;
    if(dx||dy)this.camera.setViewOffset(w,h,-dx,-dy,w,h);else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const mx=.03*(w-i.left-i.right)/w,my=.03*(h-i.top-i.bottom)/h;
    this.bounds={x0:-1+2*i.left/w+mx,x1:1-2*i.right/w-mx,y0:-1+2*i.bottom/h+my,y1:1-2*i.top/h-my};
    // Find the distance at which the whole playfield fits the default view, for any aspect ratio.
    let lo=4,hi=80;
    for(let i=0;i<22;i++){const mid=(lo+hi)/2;(this.fits(mid)?hi=mid:lo=mid);}
    this.fit=hi;
  }
  fits(distance) {
    this.place(VIEW.azimuth,VIEW.elevation,distance,this.home);this.camera.updateMatrixWorld(true);
    const b=this.bounds;
    for(const p of this.fitPoints){this.tmp.copy(p).project(this.camera);if(this.tmp.x<b.x0||this.tmp.x>b.x1||this.tmp.y<b.y0||this.tmp.y>b.y1||this.tmp.z>1)return false;}
    return true;
  }
  place(azimuth,elevation,distance,target) {
    this.offset.set(Math.cos(elevation)*Math.cos(azimuth),Math.sin(elevation),Math.cos(elevation)*Math.sin(azimuth)).multiplyScalar(distance);
    this.camera.position.copy(target).add(this.offset);this.camera.lookAt(target);
  }
  update(dt) {
    this.time+=dt;
    if(this.shot){
      this.shot.t+=dt;
      if(this.shot.t>this.shot.hold&&!this.shot.stay){
        const v=this.saved;this.shot=null;this.saved=null;this.soft=1.8;
        if(v){Object.assign(this.goal,{azimuth:this.nearestAzimuth(v.azimuth),elevation:v.elevation,zoom:v.zoom});this.goalTarget.fromArray(v.target);}
      }
    }
    this.soft=Math.max(0,this.soft-dt);
    const rate=this.intro>0?1.05:this.shot?this.shot.rate:this.soft>0?2.6:7,k=1-Math.exp(-dt*rate);this.intro=Math.max(0,this.intro-dt);
    this.azimuth+=(this.goal.azimuth-this.azimuth)*k;this.elevation+=(this.goal.elevation-this.elevation)*k;this.zoom+=(this.goal.zoom-this.zoom)*k;
    this.target.lerp(this.goalTarget,k);
    this.place(this.azimuth,this.elevation,this.fit*this.zoom,this.target);
    this.trauma=Math.max(0,this.trauma-dt*1.4);
    if(this.trauma>0) {
      const t=this.time*26,s=this.trauma*this.trauma*.32*(this.fit*this.zoom/20);
      this.look.set(Math.sin(t*1.1)+Math.sin(t*2.3)*.5,Math.sin(t*1.7+1)+Math.sin(t*3.1)*.4,Math.sin(t*1.3+2)).multiplyScalar(s);
      this.camera.position.add(this.look);this.camera.lookAt(this.tmp.copy(this.target).addScaledVector(this.look,.4));
    }
  }
  dispose(){for(const off of this.off||[])off();}
}
