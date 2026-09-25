import * as THREE from 'three';
import {PADS,SOURCE,TYPES,PATH,pathPosition,towerStats,STRIKE,dist} from '../game.js';
import {HeightField,createTerrain,scatter,PAD_Y,PAD_TOP,LIGHTHOUSE_Y,COTTAGE,PIER,MAX_DECALS,ROAD_Y,mulberry} from './terrain.js';
import {createWater} from './water.js';
import {Atmosphere,moodFor} from './sky.js';
import {createMaterials,buildLighthouse,buildPads,buildTower,CREATURES,clawGeometry,treeGeometries,rockGeometry,grassGeometry,buildCottage,buildPier,buildBoat,buildBuoy,birdGeometry,merge,part} from './models.js';
import {Particles,Debris,Ribbons,Rings,createRain,Labels,atlasTexture,SPRITE} from './effects.js';
import {CameraRig} from './camera.js';
import {Bloom} from './post.js';

const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TOWER_SCALE=1.2;
export const QUALITY={
  high:{ratio:2,shadow:2048,bloom:true,flashes:4,additive:2600,alpha:1500,debris:260,grass:1,spotShadow:true,rain:2600},
  medium:{ratio:1.5,shadow:1024,bloom:false,flashes:2,additive:1600,alpha:1000,debris:160,grass:.6,spotShadow:false,rain:1800},
  low:{ratio:1,shadow:0,bloom:false,flashes:0,additive:900,alpha:600,debris:90,grass:.3,spotShadow:false,rain:1000}
};
const rgb=(c,k=1)=>{const x=new THREE.Color(c);return [x.r*k,x.g*k,x.b*k];};
const FIRE=[rgb('#ffd27a',3.2),rgb('#ff7a2a',1.4)],SMOKE=[rgb('#6d6a66'),rgb('#3a3a3a')],DUST=[rgb('#b09a78'),rgb('#8a7a64')];
const easeBack=t=>{const c=1.9;return 1+(c+1)*(t-1)**3+c*(t-1)**2;};
const _v=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3(),_m=new THREE.Matrix4(),_m2=new THREE.Matrix4(),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_s=new THREE.Vector3(),_c=new THREE.Color(),_up=new THREE.Vector3(0,1,0),_ray=new THREE.Raycaster(),_ndc=new THREE.Vector2();

function warningTexture(color) {
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
  x.fillStyle=color;x.beginPath();x.arc(32,32,26,0,TAU);x.fill();x.lineWidth=4;x.strokeStyle='rgba(255,244,217,.9)';x.stroke();
  x.fillStyle='#fff4d9';x.font='bold 38px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('!',32,34);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function haloTexture() {
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,255,255,.55)');g.addColorStop(.5,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export class World3D {
  constructor(canvas,game,{quality='high',view=null}={}) {
    this.kind='3d';this.canvas=canvas;this.game=game;this.quality=quality;const q=this.q=QUALITY[quality];
    this.hover=null;this.selected=null;this.buildType=null;this.grid=true;this.aim=null;this.time=0;this.clock=0;this.onSound=null;
    const r=this.renderer=new THREE.WebGLRenderer({canvas,antialias:!q.bloom,powerPreference:'high-performance'});
    r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.NeutralToneMapping;r.shadowMap.enabled=q.shadow>0;r.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(34,1,.1,1400);
    this.field=new HeightField(.1);
    this.atmo=new Atmosphere(r,this.scene,{shadowSize:q.shadow});
    this.atmo.onLightning=strength=>this.lightning(strength);
    this.terrain=createTerrain(this.field,quality);this.scene.add(this.terrain.mesh);
    this.heightTexture=this.field.texture();this.water=createWater(this.heightTexture,quality);this.scene.add(this.water.mesh);
    this.mats=createMaterials();
    this.atlas=atlasTexture();this.halo=haloTexture();
    this.additive=new Particles(q.additive,this.atlas,true);this.smoke=new Particles(q.alpha,this.atlas,false);
    this.debris=new Debris(q.debris,q.shadow>0);this.ribbons=new Ribbons();this.rings=new Rings(this.atlas);this.labels=new Labels();
    this.rain=createRain(q.rain);
    this.scene.add(this.additive.mesh,this.smoke.mesh,this.debris.mesh,this.ribbons.mesh,this.rings.group,this.labels.group,this.rain.mesh);
    this.flashes=Array.from({length:q.flashes},()=>{const l=new THREE.PointLight('#ffffff',0,5,2);this.scene.add(l);return {light:l,t:0,life:1,peak:0};});
    this.decals=[];this.decalIndex=0;this.later=[];
    this.buildLighthouse();this.buildPads();this.buildCreatures();this.buildScenery();
    this.towers=new Map();this.dying=[];this.enemyViews=new Map();this.shellViews=new WeakMap();this.cables=new Map();this.networkKey='';this.ghosts={};
    this.warnings={disconnected:new THREE.SpriteMaterial({map:warningTexture('#c9674f'),depthWrite:false}),overload:new THREE.SpriteMaterial({map:warningTexture('#c99a4f'),depthWrite:false})};
    this.shells=new THREE.InstancedMesh(new THREE.SphereGeometry(.06,10,8),new THREE.MeshStandardMaterial({color:'#2e2c28',roughness:.5,metalness:.6}),40);
    this.shells.frustumCulled=false;this.shells.castShadow=q.shadow>0;this.shells.count=0;this.scene.add(this.shells);
    this.pulses=new THREE.InstancedMesh(new THREE.SphereGeometry(.026,8,6),new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:true}),96);
    this.pulses.frustumCulled=false;this.pulses.count=0;this.pulses.setColorAt(0,_c.set(1,1,1));this.scene.add(this.pulses);
    const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    this.link=new THREE.Line(lineGeo,new THREE.LineDashedMaterial({color:'#eef0bc',dashSize:.14,gapSize:.1,transparent:true,opacity:.85,depthTest:false}));this.link.visible=false;this.link.renderOrder=12;this.scene.add(this.link);
    const fit=[...Array.from({length:40},(_,i)=>{const a=i/40*TAU;return new THREE.Vector3(Math.cos(a)*7.25*.97,0,Math.sin(a)*6.25*.97);}),this.at(SOURCE.x,SOURCE.y,3.7)];
    this.rig=new CameraRig(this.camera,canvas,fit);
    // Respect reduced-motion preferences: no fly-in and no camera shake.
    this.rig.calm=matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // A renderer rebuilt for a new quality level keeps the player's camera instead of replaying the fly-in.
    if(view)this.rig.restore(view);else if(!this.rig.calm)this.rig.playIntro();
    this.bloom=q.bloom?new Bloom(r):null;
    this.atmo.setMood(moodFor(game),true);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  }
  // Game coordinates → world space. Water effects float on the surface rather than the seabed.
  at(x,y,lift=0,out=new THREE.Vector3()){return out.set(x-6.5,Math.max(this.field.sample(x,y),0)+lift,y-5.5);}
  set shake(v){if(v)this.rig.shake(v*.5);}
  get shake(){return this.rig.trauma;}
  get particles(){return [];}
  set particles(v){this.additive.clear();this.smoke.clear();this.debris.clear();this.ribbons.clear();this.rings.clear();this.labels.clear();}
  setGame(game) {
    this.game=game;
    for(const view of this.towers.values())this.removeTowerView(view);
    this.towers.clear();this.enemyViews.clear();this.particles=[];this.strike=null;this.aim=null;this.decals.length=0;this.later.length=0;this.networkKey='';this.fireworks=0;
    for(const c of this.cables.values()){this.scene.remove(c.mesh);c.mesh.geometry.dispose();}this.cables.clear();
    this.atmo.setMood(moodFor(game),true);this.lostT=0;this.hurt=0;
  }
  resize() {
    const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    this.w=rect.width;this.h=rect.height;this.dpr=Math.min(window.devicePixelRatio||1,this.q.ratio);
    this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(this.w,this.h,false);
    this.bloom?.setSize(Math.round(this.w*this.dpr),Math.round(this.h*this.dpr));
    this.rig.resize(this.w/this.h);this.rig.update(0);
    this.canvas.dispatchEvent(new CustomEvent('mapresize'));
  }

  // ————— Construction —————
  buildLighthouse() {
    const lh=this.lighthouse=buildLighthouse(this.mats),base=this.at(SOURCE.x,SOURCE.y);
    lh.group.position.set(base.x,LIGHTHOUSE_Y,base.z);this.scene.add(lh.group);
    const rocks=[],rand=mulberry(99);
    for(let i=0;i<9;i++){const a=i/9*TAU+rand()*.5,d=.78+rand()*.25;rocks.push(part(rockGeometry(i*3.1),'#8b877c',{p:[Math.cos(a)*d,.08,Math.sin(a)*d],s:[.16+rand()*.12,.14+rand()*.1,.16+rand()*.12],r:[0,rand()*6,0]}));}
    const rockMesh=new THREE.Mesh(merge(rocks),this.mats.rock);rockMesh.castShadow=rockMesh.receiveShadow=true;lh.group.add(rockMesh);
    this.lamp=new THREE.PointLight('#ffcf85',3,11,2);this.lamp.position.set(base.x,LIGHTHOUSE_Y+lh.lampY+.05,base.z);this.scene.add(this.lamp);
    this.beamLight=new THREE.SpotLight('#ffe2a8',0,42,.13,.6,1.1);this.beamLight.position.copy(this.lamp.position);
    if(this.q.spotShadow){this.beamLight.castShadow=true;this.beamLight.shadow.mapSize.set(1024,1024);this.beamLight.shadow.bias=-.0006;this.beamLight.shadow.camera.near=.5;}
    this.scene.add(this.beamLight,this.beamLight.target);
    this.haloSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.halo,color:'#ffdca0',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.haloSprite.position.copy(this.lamp.position);this.haloSprite.renderOrder=10;this.scene.add(this.haloSprite);
    this.beamYaw=0;this.beamTilt=.07;
  }
  buildPads() {
    for(const m of buildPads(PADS,this.mats,p=>this.at(p.x,p.y,0,new THREE.Vector3()).setY(PAD_Y)))this.scene.add(m);
    const ring=new THREE.RingGeometry(.4,.47,48);ring.rotateX(-Math.PI/2);this.ringGeo=ring;
    this.padMarkers=PADS.map(p=>{const m=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:'#f1d697',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));m.position.copy(this.at(p.x,p.y)).setY(PAD_TOP+.012);m.renderOrder=4;this.scene.add(m);return m;});
  }
  buildCreatures() {
    this.kinds={};
    for(const [type,def] of Object.entries(CREATURES)){
      const cap=type==='boss'?4:type==='tank'?48:90,body=new THREE.InstancedMesh(merge(def.body()),this.mats.creature,cap);
      body.castShadow=this.q.shadow>0;body.frustumCulled=false;body.count=0;body.setColorAt(0,_c.set(1,1,1));this.scene.add(body);this.kinds[type]={def,body};
    }
    const inst=(geo,mat,cap,shadow)=>{const m=new THREE.InstancedMesh(geo,mat,cap);m.frustumCulled=false;m.count=0;m.castShadow=shadow&&this.q.shadow>0;m.setColorAt(0,_c.set(1,1,1));this.scene.add(m);return m;};
    this.legs=inst(new THREE.CylinderGeometry(.62,1,1,6),new THREE.MeshStandardMaterial({roughness:.45,metalness:.65}),2600,true);
    this.eyes=inst(new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:'#ffffff'}),700,false);
    const claw=clawGeometry();this.clawArms=inst(claw.arm,this.mats.creature,64,true);this.clawJaws=inst(claw.jaw,this.mats.creature,64,true);
    const bar=new THREE.PlaneGeometry(1,1);
    this.hpBack=inst(bar,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.75,depthWrite:false}),240,false);
    this.hpFill=inst(bar,new THREE.MeshBasicMaterial({color:'#ffffff',depthWrite:false,transparent:true}),240,false);
    this.hpBack.renderOrder=13;this.hpFill.renderOrder=14;
  }
  buildScenery() {
    const {trees,rocks,grass,flowers}=scatter(this.field),q=this.q,mats=this.mats,rand=mulberry(7);
    const white=new THREE.Color(1,1,1);
    const inst=(geo,mat,list,fn,shadow=true,tint=true)=>{
      const m=new THREE.InstancedMesh(geo,mat,Math.max(1,list.length));m.count=list.length;m.castShadow=shadow&&q.shadow>0;m.receiveShadow=true;
      list.forEach((item,i)=>{fn(item,_m);m.setMatrixAt(i,_m);m.setColorAt(i,tint?_c.setHSL(.2+(item.tint??rand())*.12,.4+rand()*.2,.45+rand()*.15).lerp(white,.62):_c.setScalar(.85+rand()*.3));});
      m.computeBoundingSphere();this.scene.add(m);return m;
    };
    const geos=treeGeometries();
    for(const kind of ['pine','broad'])inst(geos[kind],mats.foliage,trees.filter(t=>t.kind===kind),(t,m)=>m.compose(_v.set(t.x-6.5,t.h-.02,t.y-5.5),_q.setFromAxisAngle(_up,t.rot),_s.setScalar(t.scale)));
    const rockGeo=rockGeometry(1.7);
    inst(rockGeo,mats.rock,rocks,(r,m)=>m.compose(_v.set(r.x-6.5,r.h-r.scale*.15,r.y-5.5),_q.setFromEuler(new THREE.Euler(r.tilt,r.rot,r.tilt*.5)),_s.set(r.scale*1.2,r.scale,r.scale)),true,false);
    const blades=grass.slice(0,Math.round(grass.length*q.grass));
    inst(grassGeometry(),mats.foliage,blades,(g,m)=>m.compose(_v.set(g.x-6.5,g.h-.01,g.y-5.5),_q.setFromAxisAngle(_up,g.rot),_s.setScalar(g.scale)),false);
    const flowerMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.022,0),new THREE.MeshStandardMaterial({roughness:.7}),Math.max(1,flowers.length));
    const petals=['#f4f1e4','#f2d16b','#d98fb0','#b9a3e3'];
    flowers.forEach((f,i)=>{_m.makeTranslation(f.x-6.5,f.h+.06,f.y-5.5);flowerMesh.setMatrixAt(i,_m);flowerMesh.setColorAt(i,_c.set(petals[Math.floor(f.color*petals.length)]));});
    flowerMesh.count=flowers.length;this.scene.add(flowerMesh);
    // Keeper's cottage, a pier with a moored boat, navigation buoys, distant sea stacks and gulls.
    const cottage=this.cottage=buildCottage(mats),cp=this.at(COTTAGE.x,COTTAGE.y);
    cottage.group.position.set(cp.x,this.field.sample(COTTAGE.x,COTTAGE.y),cp.z);cottage.group.rotation.y=-.35;this.scene.add(cottage.group);
    this.chimney=cottage.group.localToWorld(cottage.chimney.clone());
    const pier=buildPier(mats,PIER.length),pp=this.at(PIER.x,PIER.y);pier.position.set(pp.x-.6,.2,pp.z);this.scene.add(pier);
    this.boat=buildBoat(mats);this.boat.position.set(pp.x+PIER.length-.8,.02,pp.z+.55);this.boat.rotation.y=.12;this.boat.castShadow=q.shadow>0;this.scene.add(this.boat);
    this.buoys=[['#b44e3b',-3.4,2.5],['#3f7a58',-2.8,7.2],['#b44e3b',15.8,1.8],['#3f7a58',15.2,11.6]].map(([color,x,y],i)=>{
      const m=new THREE.Mesh(buildBuoy(color),mats.paint);m.position.copy(this.at(x,y));this.scene.add(m);
      const light=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),new THREE.MeshBasicMaterial({color:color==='#b44e3b'?'#ff6a4a':'#6aff9a'}));light.position.y=.4;m.add(light);
      return {mesh:m,light,phase:i*1.7,base:m.position.clone()};
    });
    const stack=rockGeometry(4.2);
    for(const [x,z,s] of [[-38,-30,5],[-52,6,7],[30,-44,6],[46,-10,4],[-18,-60,8]]){const m=new THREE.Mesh(stack,mats.rock);m.position.set(x,-.5,z);m.scale.set(s*.8,s*1.4,s*.7);m.rotation.y=x;this.scene.add(m);}
    const bird=birdGeometry();this.birds=[];
    for(let i=0;i<7;i++){
      const g=new THREE.Group(),body=new THREE.Mesh(bird.body,mats.paint),l=new THREE.Mesh(bird.wing,mats.paint),rw=new THREE.Mesh(bird.wing,mats.paint);
      rw.scale.z=-1;g.add(body,l,rw);g.scale.setScalar(1.3);this.scene.add(g);
      this.birds.push({g,l,rw,radius:4+i*1.6,height:3+(i%3)*.8,speed:.18+(i%4)*.05,phase:i*1.3,cx:(i%2?-1:1.5),cz:(i%3)-1});
    }
  }

  // ————— Picking & projection —————
  ray(px,py){_ndc.set(px/this.w*2-1,-(py/this.h)*2+1);_ray.setFromCamera(_ndc,this.camera);return _ray.ray;}
  hitPad(px,py) {
    if(!this.w)return null;const ray=this.ray(px,py);let best=null,bestT=Infinity;
    for(const pad of PADS){
      const view=[...this.towers.values()].find(v=>v.pad===pad.id),top=PAD_TOP+(view?view.model.height*TOWER_SCALE:.25),c=this.at(pad.x,pad.y);
      // Ray against a vertical cylinder around the pad and whatever stands on it.
      const ox=ray.origin.x-c.x,oz=ray.origin.z-c.z,dx=ray.direction.x,dz=ray.direction.z,a=dx*dx+dz*dz,b=2*(ox*dx+oz*dz),cc=ox*ox+oz*oz-.5*.5,disc=b*b-4*a*cc;
      if(a<1e-6||disc<0)continue;
      for(const t of [(-b-Math.sqrt(disc))/(2*a),(-b+Math.sqrt(disc))/(2*a)]){const y=ray.origin.y+ray.direction.y*t;if(t>0&&y>=PAD_Y-.05&&y<=top&&t<bestT){bestT=t;best=pad;break;}}
      const tCap=(top-ray.origin.y)/ray.direction.y;
      if(tCap>0&&tCap<bestT){const x=ray.origin.x+dx*tCap-c.x,z=ray.origin.z+dz*tCap-c.z;if(x*x+z*z<.25){bestT=tCap;best=pad;}}
    }
    return best;
  }
  pickGround(px,py){if(!this.w)return null;const ray=this.ray(px,py);return this.field.raycast(ray.origin,ray.direction);}
  p(x,y,z=0) {
    _v.set(x-6.5,Math.max(this.field.sample(x,y),PAD_Y)+z,y-5.5).project(this.camera);
    return {x:(_v.x+1)/2*this.w,y:(1-_v.y)/2*this.h,behind:_v.z>1};
  }
  consumeClick(){return this.rig.consumeClick();}
  ambience(){const s=this.atmo.state;return {rain:s.rain,storm:s.storm,wind:s.wind,waves:s.waves,night:clamp(1-s.keyI/2.4,0,1)};}

  // ————— Effects —————
  flash(pos,color,intensity=8,life=.18,distance=5) {
    if(!this.flashes.length)return;
    const f=this.flashes.reduce((a,b)=>a.t/a.life>b.t/b.life?a:b);
    f.light.position.copy(pos);f.light.color.set(color);f.light.distance=distance;f.peak=intensity;f.t=0;f.life=life;
  }
  burst(x,y,color,count=12) {
    const p=this.at(x,y,.25);
    for(let i=0;i<count;i++){const a=Math.random()*TAU,s=.6+Math.random()*1.4;this.additive.spawn({x:p.x,y:p.y,z:p.z,vx:Math.cos(a)*s,vy:1+Math.random()*2,vz:Math.sin(a)*s,life:.5+Math.random()*.4,size:.05,color:rgb(color,2.2),gravity:3.5,sprite:SPRITE.glow});}
  }
  scorch(X,Z,radius,strength=1) {
    this.decals[this.decalIndex]={x:X,z:Z,r:radius,s:strength,age:0};this.decalIndex=(this.decalIndex+1)%MAX_DECALS;
  }
  explosion(pos,{size=1,debris='#5a5652',smoke=true,fire=true,ring=true,scorch=true,shake=0,light=true}={}) {
    const A=this.additive,S=this.smoke;
    if(fire){
      for(let i=0;i<Math.round(3+size*3);i++)A.spawn({x:pos.x+(Math.random()-.5)*.12*size,y:pos.y+.08,z:pos.z+(Math.random()-.5)*.12*size,vx:(Math.random()-.5)*.8,vy:.5+Math.random()*.8,vz:(Math.random()-.5)*.8,life:.32+Math.random()*.22,size:.28*size,grow:1.2*size,color:FIRE[0],to:FIRE[1],sprite:SPRITE.glow,drag:2});
      A.spawn({x:pos.x,y:pos.y+.15,z:pos.z,life:.1,size:.45*size,grow:2.2*size,color:rgb('#ffe6b0',3),sprite:SPRITE.glow});
      for(let i=0;i<Math.round(8*size+4);i++){const a=Math.random()*TAU,s=(1.5+Math.random()*3)*Math.sqrt(size);A.spawn({x:pos.x,y:pos.y+.1,z:pos.z,vx:Math.cos(a)*s,vy:1+Math.random()*3.2,vz:Math.sin(a)*s,life:.35+Math.random()*.5,size:.022,stretch:.045,color:rgb('#ffc56a',4),gravity:6,sprite:SPRITE.glow,ground:true});}
    }
    if(smoke)for(let i=0;i<Math.round(3+size*4);i++)S.spawn({x:pos.x+(Math.random()-.5)*.3*size,y:pos.y+.12,z:pos.z+(Math.random()-.5)*.3*size,vx:(Math.random()-.5)*.35,vy:.35+Math.random()*.5,vz:(Math.random()-.5)*.35,life:1.3+Math.random()*1.2,size:.3*size,grow:.55*size,color:SMOKE[0],to:SMOKE[1],alpha:.55,sprite:SPRITE.smoke,drag:1.2,spin:(Math.random()-.5)*1.2});
    if(debris)this.debris.spawn(pos.x,pos.y+.1,pos.z,debris,Math.round(4+size*6),Math.sqrt(size),.045*Math.sqrt(size));
    if(ring)this.rings.add(pos.x,Math.max(pos.y,0)+.03,pos.z,{from:.1,to:1.2*size,life:.45,color:'#ffcf8a',intensity:1.2});
    if(scorch&&pos.y>.05)this.scorch(pos.x,pos.z,.45*size+.1,.85);
    if(light)this.flash(_v3.set(pos.x,pos.y+.4,pos.z),'#ffb060',6*size,.22+.1*size,3+2*size);
    if(shake)this.rig.shake(shake);
  }
  splash(pos,size=1) {
    for(let i=0;i<Math.round(10*size);i++){const a=Math.random()*TAU,s=Math.random()*.9*size;this.smoke.spawn({x:pos.x,y:.02,z:pos.z,vx:Math.cos(a)*s,vy:1.4+Math.random()*2*size,vz:Math.sin(a)*s,life:.6+Math.random()*.4,size:.07*size,grow:.2,color:rgb('#e8f2f0'),alpha:.8,gravity:5,sprite:SPRITE.glow});}
    this.rings.add(pos.x,.02,pos.z,{from:.15,to:.9*size,life:.8,color:'#dff2ee',intensity:.8});
  }
  lightning(strength) {
    const a=Math.random()*TAU,d=24+Math.random()*30,x=Math.cos(a)*d,z=Math.sin(a)*d,top=new THREE.Vector3(x,16,z),bottom=new THREE.Vector3(x+(Math.random()-.5)*4,0,z+(Math.random()-.5)*4);
    this.ribbons.add([top,bottom],{life:.28,width:.18,color:[.8,.85,1.2],intensity:3,jitter:1.6,segments:14});
    const delay=.35+d/60;this.onSound?.('thunder',{delay,gain:Math.min(1,strength),pan:clamp(x/30,-1,1)});
  }
  towerView(id){return this.towers.get(id);}
  muzzle(view,index=0,out=new THREE.Vector3()){const m=view.model.muzzles[index%Math.max(1,view.model.muzzles.length)]||view.model.emitter;return m.getWorldPosition(out);}
  onEvent(e) {
    const g=this.game;
    if(e.type==='shoot') {
      const view=this.towers.get(e.tower);if(!view)return;
      const target=this.at(e.toX,e.toY,.18),hit=new THREE.Vector3().copy(target);
      if(e.kind==='gun') {
        view.shot=(view.shot||0)+1;const from=this.muzzle(view,view.shot);view.kick=1;view.spinBoost=1;view.idle=0;
        this.additive.spawn({x:from.x,y:from.y,z:from.z,life:.06,size:.2,color:rgb('#ffd98a',4),sprite:SPRITE.star});
        this.additive.spawn({x:from.x,y:from.y,z:from.z,life:.08,size:.32,color:rgb('#ff9a40',2),sprite:SPRITE.glow});
        const v=_v.subVectors(hit,from).divideScalar(.15);
        this.additive.spawn({x:from.x,y:from.y,z:from.z,vx:v.x,vy:v.y,vz:v.z,life:.15,size:.03,stretch:.028,color:rgb('#ffe2a0',5),sprite:SPRITE.glow});
        this.smoke.spawn({x:from.x,y:from.y,z:from.z,vx:(Math.random()-.5)*.2,vy:.3,vz:(Math.random()-.5)*.2,life:.5,size:.06,grow:.25,color:rgb('#9a958c'),alpha:.35,sprite:SPRITE.smoke});
        if(Math.random()<.5)this.debris.spawn(from.x,from.y,from.z,'#c9a24a',1,.4,.018);
        this.flash(from,'#ffc070',2.5,.06,2.5);
      } else if(e.kind==='mortar') {
        const from=this.muzzle(view,0);view.kick=1;view.idle=0;
        this.additive.spawn({x:from.x,y:from.y,z:from.z,life:.1,size:.5,color:rgb('#ffcf80',4),sprite:SPRITE.star});
        for(let i=0;i<5;i++)this.smoke.spawn({x:from.x,y:from.y,z:from.z,vx:(Math.random()-.5)*.6,vy:.5+Math.random()*.6,vz:(Math.random()-.5)*.6,life:1+Math.random()*.6,size:.14,grow:.45,color:rgb('#8a8680'),alpha:.5,sprite:SPRITE.smoke,drag:1.5});
        this.flash(from,'#ffb060',4,.12,3.5);this.rig.shake(.04);
      } else if(e.kind==='frost') {
        const from=view.model.emitter.getWorldPosition(new THREE.Vector3());view.kick=1;view.idle=0;
        this.ribbons.add([from,hit],{life:.22,width:.07,color:[.55,1.5,1.7],intensity:1.4,jitter:.05,segments:8});
        this.additive.spawn({x:from.x,y:from.y,z:from.z,life:.2,size:.4,color:rgb('#9ff3ee',2),sprite:SPRITE.glow});
      } else if(e.kind==='arc') {
        const from=view.model.emitter.getWorldPosition(new THREE.Vector3()),points=[from,...(e.points||[{x:e.toX,y:e.toY}]).map(p=>this.at(p.x,p.y,.2))];
        this.ribbons.add(points,{life:.17,width:.045,color:[1.1,.95,2.4],intensity:2.4,jitter:.28});
        this.ribbons.add(points,{life:.12,width:.02,color:[1.6,1.6,2],intensity:2,jitter:.2});
        this.additive.spawn({x:from.x,y:from.y,z:from.z,life:.16,size:.5,color:rgb('#c9b8ff',2.5),sprite:SPRITE.glow});
        this.flash(from,'#b8a4ff',4,.12,4);
      }
    } else if(e.type==='hit') {
      const p=this.at(e.x,e.y,.18),kind=e.kind;
      const color=kind==='frost'?rgb('#b8fff7',2.4):kind==='arc'?rgb('#d6c8ff',3):rgb('#ffd27a',3);
      for(let i=0;i<(kind==='frost'?7:5);i++){const a=Math.random()*TAU,s=.6+Math.random()*1.3;this.additive.spawn({x:p.x,y:p.y,z:p.z,vx:Math.cos(a)*s,vy:.4+Math.random()*1.4,vz:Math.sin(a)*s,life:.2+Math.random()*.25,size:.02,stretch:kind==='frost'?0:.035,color,gravity:4,sprite:kind==='frost'?SPRITE.star:SPRITE.glow,spin:4});}
      if(kind==='frost')this.smoke.spawn({x:p.x,y:p.y,z:p.z,vy:.15,life:.8,size:.18,grow:.3,color:rgb('#dffaff'),alpha:.35,sprite:SPRITE.smoke});
    } else if(e.type==='blast') {
      this.explosion(this.at(e.x,e.y),{size:1,debris:'#6d5a44',shake:.1});
    } else if(e.type==='kill') {
      const p=this.at(e.x,e.y,.05),def=CREATURES[e.enemyType],boss=e.enemyType==='boss',big=boss?2.4:e.enemyType==='tank'?1.25:e.enemyType==='splitter'?.9:e.enemyType==='spawn'?.45:.7;
      if(e.enemyType==='splitter'||e.enemyType==='spawn') {
        for(let i=0;i<14*big;i++){const a=Math.random()*TAU,s=.5+Math.random()*1.5;this.smoke.spawn({x:p.x,y:p.y+.15,z:p.z,vx:Math.cos(a)*s,vy:1+Math.random()*2,vz:Math.sin(a)*s,life:.7,size:.05,grow:.1,color:rgb('#9fd86a'),alpha:.9,gravity:5,sprite:SPRITE.glow,ground:true});}
        this.additive.spawn({x:p.x,y:p.y+.2,z:p.z,life:.25,size:.6*big,color:rgb('#c9ff8a',2),sprite:SPRITE.glow});
        this.debris.spawn(p.x,p.y+.1,p.z,'#4f6b3e',Math.round(4*big),.8,.03);
      } else this.explosion(p,{size:big,debris:e.color||'#6a5a58',shake:boss?.9:big>1?.12:0,scorch:big>1});
      if(boss)for(let i=1;i<=4;i++)this.later.push({t:i*.22,run:()=>this.explosion(this.at(e.x+(Math.random()-.5)*1.4,e.y+(Math.random()-.5)*1.4),{size:1.3,debris:'#5b3b36',shake:.3})});
      this.labels.add(`+${e.reward??0}`,p.x,p.y+(def?.hpY||.4)+.1,p.z,'#f3dc9a',boss?.8:.36);
    } else if(e.type==='split') {
      const p=this.at(e.x,e.y,.05);this.rings.add(p.x,p.y+.02,p.z,{to:.9,life:.5,color:'#b8ff72',intensity:1});
    } else if(e.type==='leak') {
      const p=this.at(SOURCE.x-.75,SOURCE.y+.05,.2);this.explosion(p,{size:1.4,debris:'#b44e3b',shake:.55,scorch:false});this.hurt=1;
    } else if(e.type==='build'||e.type==='upgrade') {
      const t=e.tower,p=this.at(t.x,t.y,.02).setY(PAD_TOP);
      for(let i=0;i<14;i++){const a=i/14*TAU;this.smoke.spawn({x:p.x+Math.cos(a)*.35,y:p.y,z:p.z+Math.sin(a)*.35,vx:Math.cos(a)*.6,vy:.25,vz:Math.sin(a)*.6,life:.9,size:.12,grow:.3,color:DUST[0],to:DUST[1],alpha:.55,sprite:SPRITE.smoke,drag:2.2});}
      this.burst(t.x,t.y,TYPES[t.type].color,e.type==='upgrade'?24:14);
      this.rings.add(p.x,p.y+.02,p.z,{from:.3,to:1.1,life:.5,color:TYPES[t.type].color,intensity:e.type==='upgrade'?2:1.2});
      if(e.type==='upgrade')this.flash(_v3.copy(p).setY(p.y+.8),TYPES[t.type].color,5,.35,3);
    } else if(e.type==='sell') {
      const t=e.tower;if(t){const p=this.at(t.x,t.y).setY(PAD_TOP);for(let i=0;i<10;i++)this.smoke.spawn({x:p.x+(Math.random()-.5)*.5,y:p.y,z:p.z+(Math.random()-.5)*.5,vy:.4,life:1,size:.15,grow:.3,color:DUST[0],alpha:.5,sprite:SPRITE.smoke});}
    } else if(e.type==='strike') {
      this.strike={x:e.x,y:e.y,t:0};
    } else if(e.type==='strikeHit') {
      const p=this.at(e.x,e.y),lamp=this.lamp.position.clone();
      this.ribbons.add([lamp,p.clone()],{life:.55,width:.55,color:[1.6,1.3,.8],intensity:2.6,grow:-1.2});
      this.ribbons.add([p.clone().setY(p.y+9),p.clone()],{life:.45,width:.9,color:[1.8,1.5,1],intensity:2});
      this.explosion(p,{size:2.2,debris:'#6a5a44',shake:.7});
      for(let i=0;i<40;i++){const a=Math.random()*TAU,r=Math.random()*STRIKE.radius;this.additive.spawn({x:p.x+Math.cos(a)*r,y:p.y+.05,z:p.z+Math.sin(a)*r,vy:.8+Math.random()*2.2,life:.8+Math.random()*.9,size:.03,stretch:.02,color:rgb('#ffcf7a',3),gravity:-.4,drag:1,sprite:SPRITE.glow});}
      this.rings.add(p.x,p.y+.04,p.z,{from:.2,to:STRIKE.radius*1.4,life:.7,color:'#ffe2a0',intensity:2.5});
      this.scorch(p.x,p.z,STRIKE.radius*.95,1);this.flash(_v3.copy(p).setY(p.y+1),'#ffd9a0',30,.5,9);this.strike=null;
    } else if(e.type==='boss') {
      const p=this.at(-.6,4);this.splash(p,3);this.rig.shake(.6);this.flash(_v3.set(p.x,1,p.z),'#ff5a3a',14,1.2,8);
    } else if(e.type==='overdrive') {
      this.flash(this.lamp.position,'#ffe0a0',20,.6,10);this.rings.add(this.lamp.position.x,PAD_TOP,this.lamp.position.z,{from:.5,to:9,life:1.2,color:'#ffe2a0',intensity:1.4});
    } else if(e.type==='grid') {
      for(const c of this.cables.values())c.surge=1;
    } else if(e.type==='wave') {
      this.beamPulse=1;
    } else if(e.type==='won') {
      this.fireworks=4;
    }
  }

  // ————— Per-frame sync —————
  syncTowers(dt) {
    const g=this.game,alive=new Set(),od=g.overdrive>0;
    for(const t of g.towers){
      alive.add(t.id);let view=this.towers.get(t.id);
      if(view&&view.level!==t.level){this.removeTowerView(view,false);view=null;}
      if(!view){view=this.addTowerView(t,this.towers.has(t.id)?1:0);this.towers.set(t.id,view);}
      const m=view.model;view.age+=dt;
      const grow=view.age<.5?easeBack(clamp(view.age/.5,0,1)):1;m.root.scale.set(TOWER_SCALE,TOWER_SCALE*Math.max(.01,grow),TOWER_SCALE);
      view.idle=(view.idle||0)+dt;
      if(m.yaw){let target=-t.angle+(view.idle>2.5&&t.powered?Math.sin((view.idle-2.5)*.6+t.id)*.9:0),d=target-view.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));view.yaw+=d*(1-Math.exp(-dt*12));m.yaw.rotation.y=view.yaw;}
      view.kick=Math.max(0,(view.kick||0)-dt*7);
      if(m.recoil&&t.type==='gun')m.recoil.position.x=.22-.06*view.kick;
      if(m.recoil&&t.type==='mortar')m.recoil.position.y=-.07*view.kick;
      if(m.spin){view.spinBoost=Math.max(0,(view.spinBoost||0)-dt*1.5);m.spin.rotation.x+=dt*(2+view.spinBoost*22);}
      if(m.crystal){m.crystal.rotation.y+=dt*(t.powered?1.2:.2);m.crystal.position.y=.76+Math.sin(this.time*2+t.id)*.03+(view.kick||0)*.04;m.orbit.rotation.y-=dt*(t.powered?1.8:.3);}
      const pulse=od?1.7+Math.sin(this.clock*14)*.5:1;
      if(t.type==='relay'){const blink=Math.sin(this.clock*4+t.id)>0?1:.25;m.glow.emissive.set(t.connected?'#9df27a':'#ff5a4a');m.glow.emissiveIntensity=(t.connected?2.2:3)*blink;}
      else{m.glow.emissiveIntensity=t.powered?2.3*pulse:.04;if(m.crystalMat?.emissive)m.crystalMat.emissiveIntensity=t.powered?.55*pulse+(view.kick||0)*.8:.06;}
      if(od&&t.powered&&t.type!=='relay'&&Math.random()<dt*6){const p=m.root.getWorldPosition(_v);this.additive.spawn({x:p.x+(Math.random()-.5)*.5,y:p.y+.2,z:p.z+(Math.random()-.5)*.5,vy:.9,life:.8,size:.04,color:rgb('#ffe2a0',3),sprite:SPRITE.glow});}
      const warn=!t.powered&&view.age>.4;view.warn.visible=warn;
      if(warn){view.warn.material=t.connected?this.warnings.overload:this.warnings.disconnected;view.warn.position.y=m.height+.3+Math.sin(this.clock*3+t.id)*.05;}
      if(t.type==='arc'&&t.powered&&Math.random()<dt*1.4){const e=m.emitter.getWorldPosition(new THREE.Vector3()),a=Math.random()*TAU;this.ribbons.add([e,e.clone().add(_v2.set(Math.cos(a)*.25,-.25-Math.random()*.3,Math.sin(a)*.25))],{life:.08,width:.012,color:[1,.9,2.2],intensity:2,jitter:.12,segments:5});}
    }
    for(const view of [...this.towers.values()])if(!alive.has(view.id)){this.towers.delete(view.id);this.removeTowerView(view,true);}
    for(const d of this.dying){d.t+=dt;d.model.root.position.y=PAD_TOP-d.t*1.6;d.model.root.scale.setScalar(TOWER_SCALE*Math.max(.01,1-d.t*2));}
    this.dying=this.dying.filter(d=>{if(d.t<.5)return true;this.scene.remove(d.model.root);d.model.dispose();return false;});
  }
  addTowerView(t,age=0) {
    const model=buildTower(t.type,t.level,this.mats,{color:TYPES[t.type].color}),p=this.at(t.x,t.y);
    model.root.position.set(p.x,PAD_TOP,p.z);this.scene.add(model.root);
    const warn=new THREE.Sprite(this.warnings.overload);warn.scale.setScalar(.3);warn.visible=false;warn.renderOrder=15;model.root.add(warn);
    return {id:t.id,pad:t.pad,type:t.type,level:t.level,model,yaw:-t.angle,age:age?1:0,warn};
  }
  removeTowerView(view,animate=false) {
    if(animate){this.dying.push({model:view.model,t:0});return;}
    this.scene.remove(view.model.root);view.model.dispose();
  }
  syncCables(dt) {
    const g=this.game,key=g.network.map(e=>`${e.from.id}>${e.to.id}:${e.to.powered?1:0}`).join('|')+'#'+g.towers.map(t=>t.id+':'+t.level).join(',');
    if(key!==this.networkKey){
      this.networkKey=key;
      for(const c of this.cables.values()){this.scene.remove(c.mesh);c.mesh.geometry.dispose();}this.cables.clear();
      for(const edge of g.network){
        const a=this.anchorOf(edge.from,edge.to),b=this.anchorOf(edge.to,edge.from);if(!a||!b)continue;
        const len=a.distanceTo(b),sag=.08+len*.05,pts=[];
        for(let i=0;i<=12;i++){const t=i/12,p=a.clone().lerp(b,t);p.y-=sag*4*t*(1-t);const gx=p.x+6.5,gy=p.z+5.5;p.y=Math.max(p.y,Math.max(this.field.sample(gx,gy),0)+.05);pts.push(p);}
        const curve=new THREE.CatmullRomCurve3(pts),mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.011,4),this.mats.cable);
        mesh.castShadow=this.q.shadow>0;this.scene.add(mesh);
        this.cables.set(`${edge.from.id}>${edge.to.id}`,{mesh,curve,powered:edge.to.powered,offset:Math.random(),surge:0,len});
      }
    }
    let n=0;const show=this.grid||this.buildType,od=this.game.overdrive>0;
    for(const c of this.cables.values()){
      c.surge=Math.max(0,c.surge-dt);
      if(!show||!c.powered)continue;
      for(const k of [0,.5]){
        if(n>=96)break;const t=(this.clock*(od?.9:.35)/Math.max(1,c.len*.5)+c.offset+k)%1;
        c.curve.getPointAt(t,_v);_m.makeTranslation(_v.x,_v.y,_v.z);this.pulses.setMatrixAt(n,_m);this.pulses.setColorAt(n,_c.setRGB(1.7,1.9,1.15).multiplyScalar(od||c.surge?1.9:1));n++;
      }
    }
    this.pulses.count=n;this.pulses.instanceMatrix.needsUpdate=true;if(this.pulses.instanceColor)this.pulses.instanceColor.needsUpdate=true;
    this.mats.cable.emissive.set(show?'#3a4a2a':'#000000');
  }
  anchorOf(node,other) {
    if(node.type==='source')return this.lighthouse.anchor.getWorldPosition(new THREE.Vector3());
    const view=this.towers.get(node.id);if(!view)return null;
    view.model.root.updateWorldMatrix(true,true);
    const local=view.model.anchors?view.model.anchors.map(a=>a.clone()):[view.model.anchor.position.clone()],o=this.at(other.x,other.y);
    return local.map(a=>a.multiplyScalar(TOWER_SCALE).add(view.model.root.position)).sort((a,b)=>a.distanceTo(o)-b.distanceTo(o))[0];
  }
  syncCreatures(dt) {
    const g=this.game,alive=new Set(),counts={},cam=this.camera;
    for(const type of Object.keys(this.kinds))counts[type]=0;
    let legN=0,eyeN=0,clawN=0,barN=0;const tint=new THREE.Color(),legColor=new THREE.Color(),eyeGlow=new THREE.Color(),knee=new THREE.Vector3(),perp=new THREE.Vector3(),size=new THREE.Vector3(),euler=new THREE.Euler(),jaw=new THREE.Matrix4();
    const room=(mesh,n,extra=1)=>n+extra<=mesh.instanceMatrix.count;
    for(const e of g.enemies){
      if(e.hp<=0)continue;
      const k=this.kinds[e.type];if(!k||!room(k.body,counts[e.type]))continue;const def=k.def;alive.add(e.id);
      let v=this.enemyViews.get(e.id);
      if(!v){v={yaw:0,gait:Math.random()*6,last:e.distance};this.enemyViews.set(e.id,v);
        const a=pathPosition(e.distance+.1),b=pathPosition(Math.max(0,e.distance-.1));v.yaw=Math.atan2(-(a.y-b.y),a.x-b.x);
        if(e.distance<.5&&e.type!=='spawn')this.splash(this.at(e.x-.2,e.y),e.type==='boss'?2.5:.7);}
      const moved=e.distance-v.last;v.last=e.distance;v.gait+=moved*Math.PI/def.legs.stride;
      const a=pathPosition(e.distance+.12),b=pathPosition(Math.max(0,e.distance-.12)),targetYaw=Math.atan2(-(a.y-b.y),a.x-b.x);
      let dy=targetYaw-v.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));v.yaw+=dy*(1-Math.exp(-dt*9));
      const rise=e.type!=='spawn'&&e.distance<.55?(1-e.distance/.55)**2*(.3+def.bodyY*def.scale):0;
      const gy=this.field.sample(e.x,e.y),stun=e.stun>0,wobble=stun?Math.sin(this.time*18+e.id)*.12:0;
      const root=_m2.compose(_v.set(e.x-6.5,gy-rise,e.y-5.5),_q.setFromAxisAngle(_up,v.yaw+wobble),_s.setScalar(def.scale));
      const hit=e.hit>0?1+e.hit*18:1,frost=e.slow>0;tint.setRGB(hit*(frost?.72:stun?1.25:1),hit*(frost?.92:stun?1.2:1),hit*(frost?1.35:stun?.8:1));
      const bob=Math.abs(Math.sin(v.gait))*def.legs.lift*.35;
      _m.makeTranslation(0,bob,0);_m.premultiply(root);k.body.setMatrixAt(counts[e.type],_m);k.body.setColorAt(counts[e.type]++,tint);
      // Legs: two-bone IK from hip to a stepping foot.
      const L=def.legs,hips=L.hips;legColor.set(def.leg).multiplyScalar(hit);
      for(let i=0;i<hips.length;i++)for(const side of [1,-1]){
        if(!room(this.legs,legN,2))break;
        const [hx,hz]=hips[i],phase=v.gait+(i%2?Math.PI:0)+(side>0?0:Math.PI)+(hips.length>3?i*.9:0);
        const H=_v.set(hx,def.bodyY*.92+bob,side*hz),fx=hx*1.25+Math.cos(phase)*L.stride*.5,lift=Math.max(0,-Math.sin(phase))*L.lift;
        const F=_v2.set(fx,lift,side*(hz+L.reach));
        const D=Math.min(H.distanceTo(F),L.upper+L.lower-.001),dir=_v3.subVectors(F,H).normalize(),ax=(L.upper*L.upper-L.lower*L.lower+D*D)/(2*D),hk=Math.sqrt(Math.max(0,L.upper*L.upper-ax*ax));
        perp.set(0,1,0).addScaledVector(dir,-dir.y).normalize();const K=knee.copy(H).addScaledVector(dir,ax).addScaledVector(perp,hk);
        for(const [A,B,r] of [[H,K,L.radius],[K,F,L.radius*.8]]){
          const len=A.distanceTo(B);_q2.setFromUnitVectors(_up,_s.subVectors(B,A).normalize());
          _m.compose(_s.addVectors(A,B).multiplyScalar(.5),_q2,size.set(r,len,r)).premultiply(root);
          this.legs.setMatrixAt(legN,_m);this.legs.setColorAt(legN++,legColor);
        }
      }
      eyeGlow.set(def.eye).multiplyScalar(e.type==='boss'?5:3.2);
      for(const [x,y,z] of def.eyes){if(!room(this.eyes,eyeN))break;_m.compose(_v.set(x,y+bob,z),_q.identity(),_s.setScalar(def.eyeSize)).premultiply(root);if(def.eyeScale)_m.scale(_v.fromArray(def.eyeScale));this.eyes.setMatrixAt(eyeN,_m);this.eyes.setColorAt(eyeN++,eyeGlow);}
      if(def.claws&&room(this.clawArms,clawN,2)){
        const c=def.claws,open=.35+.3*Math.sin(this.time*(e.type==='boss'?2.2:3.4)+e.id);
        for(const side of [1,-1]){
          const arm=_m.compose(_v.set(c.arm[0],c.arm[1]+bob,side*c.arm[2]),_q.setFromEuler(euler.set(0,-side*.35,.15)),_s.setScalar(c.size*2.2)).premultiply(root);
          this.clawArms.setMatrixAt(clawN,arm);this.clawArms.setColorAt(clawN,tint);
          jaw.compose(_v.set(.56,.02,0),_q.setFromEuler(euler.set(0,0,open)),_s.set(1,1,1)).premultiply(arm);
          this.clawJaws.setMatrixAt(clawN,jaw);this.clawJaws.setColorAt(clawN++,tint);
        }
      }
      if(def.core&&Math.random()<dt*20){const [x,y,z,r]=def.core;_v.set(x,y,z).applyMatrix4(root);this.additive.spawn({x:_v.x+(Math.random()-.5)*r,y:_v.y+r*.6,z:_v.z+(Math.random()-.5)*r,vy:.6,life:.6,size:.12,color:rgb('#ff6a2a',2.5),sprite:SPRITE.glow});}
      if(e.type==='tank'&&Math.abs(Math.sin(v.gait))<.08&&moved>0&&Math.random()<.4)this.smoke.spawn({x:e.x-6.5,y:gy+.03,z:e.y-5.5,vy:.15,life:.8,size:.1,grow:.25,color:DUST[0],alpha:.35,sprite:SPRITE.smoke});
      if(stun&&Math.random()<dt*10){_v.set(0,def.hpY*.8,0).applyMatrix4(root);this.additive.spawn({x:_v.x+(Math.random()-.5)*.3,y:_v.y,z:_v.z+(Math.random()-.5)*.3,vy:.3,life:.4,size:.06,color:rgb('#fff0a0',3),sprite:SPRITE.star,spin:5});}
      if(frost&&Math.random()<dt*6){_v.set(0,def.bodyY,0).applyMatrix4(root);this.smoke.spawn({x:_v.x,y:_v.y,z:_v.z,vy:-.05,life:.9,size:.12,grow:.2,color:rgb('#e6fbff'),alpha:.3,sprite:SPRITE.smoke});}
      // Health bar, billboarded towards the camera.
      if((e.hp<e.maxHp||e.type==='boss')&&room(this.hpBack,barN)){
        const w=def.hpW*def.scale,frac=clamp(e.hp/e.maxHp,0,1);_v.set(0,def.hpY,0).applyMatrix4(root);
        _m.compose(_v,cam.quaternion,_s.set(w+.04,e.type==='boss'?.085:.055,1));this.hpBack.setMatrixAt(barN,_m);this.hpBack.setColorAt(barN,_c.set('#1d3533'));
        _v2.set(1,0,0).applyQuaternion(cam.quaternion).multiplyScalar(-(1-frac)*w/2);
        _m.compose(_v.add(_v2),cam.quaternion,_s.set(Math.max(.001,w*frac),e.type==='boss'?.05:.03,1));this.hpFill.setMatrixAt(barN,_m);
        this.hpFill.setColorAt(barN++,_c.set(e.type==='boss'?'#f0a86e':frac>.5?'#d6dea5':frac>.25?'#e8c47a':'#e88a6a'));
      }
    }
    for(const [type,k] of Object.entries(this.kinds)){k.body.count=counts[type];k.body.instanceMatrix.needsUpdate=true;if(k.body.instanceColor)k.body.instanceColor.needsUpdate=true;}
    for(const [mesh,n] of [[this.legs,legN],[this.eyes,eyeN],[this.clawArms,clawN],[this.clawJaws,clawN],[this.hpBack,barN],[this.hpFill,barN]]){mesh.count=n;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    for(const id of this.enemyViews.keys())if(!alive.has(id))this.enemyViews.delete(id);
  }
  syncShells(dt) {
    let n=0;
    for(const p of this.game.projectiles){
      if(p.kind!=='mortar'||n>=40)continue;
      let s=this.shellViews.get(p);
      if(!s){const view=this.towers.get(p.tower);s={from:view?this.muzzle(view,0):this.at(p.fromX,p.fromY,.8),to:this.at(p.toX,p.toY,.05)};this.shellViews.set(p,s);}
      const t=clamp(p.age/p.duration,0,1);_v.copy(s.from).lerp(s.to,t);_v.y+=Math.sin(t*Math.PI)*(1.6+s.from.distanceTo(s.to)*.2);
      _m.makeTranslation(_v.x,_v.y,_v.z);this.shells.setMatrixAt(n++,_m);
      if(Math.random()<.7)this.smoke.spawn({x:_v.x,y:_v.y,z:_v.z,life:.6,size:.05,grow:.2,color:rgb('#aaa59c'),alpha:.35,sprite:SPRITE.smoke});
      this.additive.spawn({x:_v.x,y:_v.y,z:_v.z,life:.05,size:.08,color:rgb('#ffb060',2),sprite:SPRITE.glow});
    }
    this.shells.count=n;this.shells.instanceMatrix.needsUpdate=true;
  }
  syncMarkers() {
    const g=this.game,build=this.buildType,pulse=.5+.5*Math.sin(this.clock*4);
    PADS.forEach((pad,i)=>{
      const m=this.padMarkers[i],occupied=g.towers.some(t=>t.pad===pad.id),active=this.hover===pad.id||this.selected===pad.id;
      let o=0;if(active)o=this.selected===pad.id?.95:.7;else if(!occupied)o=build&&g.canEdit()?.25+.25*pulse:.1;
      m.material.opacity=o;m.visible=o>0;m.material.color.set(active?'#f5d795':build&&!occupied?'#d9e6b0':'#c9d4b4');
    });
    const target=PADS[this.hover??this.selected],chosen=target&&g.towers.find(t=>t.pad===target.id),u=this.terrain.uniforms;
    u.uRange.value.set(0,0,0,0);this.link.visible=false;
    for(const [type,ghost] of Object.entries(this.ghosts))ghost.root.visible=false;
    if(target&&(chosen||build)){
      const type=chosen?chosen.type:build,stats=chosen?towerStats(chosen):TYPES[type],radius=type==='relay'?4.8:stats.range,c=this.at(target.x,target.y);
      u.uRange.value.set(c.x,c.z,radius,1);u.uRangeColor.value.set(TYPES[type].color);
      if(build&&!chosen){
        let ghost=this.ghosts[build];
        if(!ghost){ghost=this.ghosts[build]=buildTower(build,1,this.mats,{ghost:true});this.scene.add(ghost.root);}
        ghost.root.visible=true;ghost.root.position.set(c.x,PAD_TOP,c.z);ghost.root.scale.setScalar(TOWER_SCALE*(1+.02*Math.sin(this.clock*6)));
        const parent=[{...SOURCE,type:'source',id:0},...g.towers.filter(t=>t.connected)].find(t=>dist(t,target)<=Math.max(t.type==='source'?SOURCE.radius:t.type==='relay'?4.8:3,build==='relay'?4.8:3));
        if(parent){const a=parent.type==='source'?this.lighthouse.anchor.getWorldPosition(_v):this.at(parent.x,parent.y,.45,_v),b=_v2.copy(c).setY(PAD_TOP+.5);
          this.link.geometry.attributes.position.setXYZ(0,a.x,a.y,a.z);this.link.geometry.attributes.position.setXYZ(1,b.x,b.y,b.z);this.link.geometry.attributes.position.needsUpdate=true;this.link.computeLineDistances();this.link.visible=true;}
      }
    }
    if(this.aim){const c=this.at(this.aim.x,this.aim.y);u.uAim.value.set(c.x,c.z,STRIKE.radius,1);}else u.uAim.value.set(0,0,0,0);
  }
  syncLighthouse(dt,s) {
    const g=this.game,lh=this.lighthouse,lost=g.phase==='lost';
    this.hurt=Math.max(0,(this.hurt||0)-dt*1.5);this.beamPulse=Math.max(0,(this.beamPulse||0)-dt*.8);
    this.lostT=lost?(this.lostT||0)+dt:0;
    const health=g.hp/100,flicker=health<.6?1-(.35*(1-health))*(Math.sin(this.clock*23)*Math.sin(this.clock*7.3)>.55?1:0):1;
    const dying=lost?Math.max(0,1-this.lostT/1.6)*(Math.sin(this.lostT*40)>0?1:.3):1;
    const od=g.overdrive>0?1.5:1,power=clamp(s.beam,0,3)*flicker*dying*(1-this.hurt*.6)*od*(1+this.beamPulse*.6);
    // The lamp sweeps the island; during a strike it swings onto the target and dips its beam.
    let goalTilt=.07;
    if(this.strike){
      this.strike.t+=dt;const c=this.at(this.strike.x,this.strike.y),dx=c.x-this.lamp.position.x,dz=c.z-this.lamp.position.z,goal=Math.atan2(-dz,dx);
      let d=goal-this.beamYaw;d=Math.atan2(Math.sin(d),Math.cos(d));this.beamYaw+=d*(1-Math.exp(-dt*14));
      goalTilt=Math.atan2(this.lamp.position.y-c.y,Math.hypot(dx,dz));
      if(Math.random()<.9){const a=Math.random()*TAU,r=STRIKE.radius*(1-this.strike.t/STRIKE.delay*.6);this.additive.spawn({x:c.x+Math.cos(a)*r,y:c.y+.08,z:c.z+Math.sin(a)*r,vx:-Math.cos(a)*r*1.2,vz:-Math.sin(a)*r*1.2,vy:.2,life:.4,size:.05,color:rgb('#ffe2a0',3),sprite:SPRITE.glow});}
    } else this.beamYaw-=dt*(.3+(g.overdrive>0?.5:0));
    this.beamTilt+=(goalTilt-this.beamTilt)*(1-Math.exp(-dt*10));
    lh.lens.rotation.set(0,this.beamYaw,0);lh.beams[0].rotation.z=-this.beamTilt;lh.beams[1].rotation.z=-.07;
    const strikeBoost=this.strike?2.2:1;
    lh.beams.forEach((b,i)=>{b.material.uniforms.uIntensity.value=power*b.userData.strength*(i===0?strikeBoost:1)*.085;b.material.uniforms.uTime.value=this.clock;b.visible=power>.02;});
    lh.lampMat.emissiveIntensity=2+power*3.2;lh.lensMat.emissiveIntensity=.6+power*1.4;lh.windowMat.emissiveIntensity=(s.lamps*1.6)*dying;
    this.lamp.intensity=(2+power*6)*(lost?dying:1);
    _v.set(Math.cos(this.beamYaw)*Math.cos(this.beamTilt),-Math.sin(this.beamTilt),-Math.sin(this.beamYaw)*Math.cos(this.beamTilt));
    this.beamLight.target.position.copy(this.beamLight.position).addScaledVector(_v,12);this.beamLight.intensity=power*(this.strike?260:90);
    this.haloSprite.material.opacity=clamp(.25+power*.3,0,1);this.haloSprite.scale.setScalar(1.1+power*.5);
    if(g.hp<55&&!lost&&Math.random()<dt*(g.hp<30?9:4)){const p=this.lamp.position;this.smoke.spawn({x:p.x+(Math.random()-.5)*.4,y:p.y-.4,z:p.z+(Math.random()-.5)*.4,vx:.25,vy:.45,life:2.4,size:.16,grow:.5,color:rgb('#4a4744'),alpha:.5,sprite:SPRITE.smoke,drag:.4});}
    if(g.hp<30&&!lost&&Math.random()<dt*6){const p=this.at(SOURCE.x-.5,SOURCE.y+.2,.6);this.additive.spawn({x:p.x,y:p.y,z:p.z,vx:(Math.random()-.5)*.3,vy:.7,life:.5,size:.12,color:FIRE[0],to:FIRE[1],sprite:SPRITE.glow});}
    const cw=this.cottage;cw.windowMat.emissiveIntensity=s.lamps*1.8;cw.lampMat.emissiveIntensity=s.lamps*4;
  }
  ambient(dt,s) {
    const t=this.clock;
    for(const b of this.buoys){b.mesh.position.y=b.base.y+Math.sin(t*1.3+b.phase)*.05*s.waves;b.mesh.rotation.z=Math.sin(t*1.1+b.phase)*.1*s.waves;b.light.visible=(t+b.phase)%2.4<.35;}
    this.boat.position.y=.02+Math.sin(t*1.2)*.035*s.waves;this.boat.rotation.x=Math.sin(t*.9)*.05*s.waves;this.boat.rotation.z=Math.sin(t*1.3+1)*.03*s.waves;
    const day=clamp((s.keyI-1)/1.2,0,1)*(1-s.rain);
    for(const b of this.birds){
      const a=t*b.speed+b.phase;b.g.visible=day>.15;b.g.scale.setScalar(1.3*day);
      b.g.position.set(b.cx+Math.cos(a)*b.radius,b.height+Math.sin(a*2.3)*.3,b.cz+Math.sin(a)*b.radius);b.g.rotation.y=-a-Math.PI/2;
      const flap=Math.sin(t*9+b.phase)*.55;b.l.rotation.x=flap;b.rw.rotation.x=-flap;
    }
    this.smokeT=(this.smokeT||0)-dt;
    if(this.smokeT<=0){this.smokeT=.32;const c=this.chimney;this.smoke.spawn({x:c.x,y:c.y,z:c.z,vx:.12+s.wind*.25,vy:.28,vz:.05,life:3.2,size:.08,grow:.22,color:rgb('#c8c4bc'),to:rgb('#8a8a8a'),alpha:.4,sprite:SPRITE.smoke,drag:.3,spin:.4});}
    if(s.stars>.6&&s.rain<.2&&Math.random()<dt*5){const a=Math.random()*TAU,r=2+Math.random()*5,x=Math.cos(a)*r-.5,z=Math.sin(a)*r,gy=this.field.sample(x+6.5,z+5.5);
      if(gy>.3)this.additive.spawn({x,y:gy+.25+Math.random()*.4,z,vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.1,vz:(Math.random()-.5)*.2,life:3+Math.random()*2,size:.035,color:rgb('#d8ff8a',3),sprite:SPRITE.glow,fadeIn:1});}
    if(s.rain>.05){const n=Math.round(s.rain*dt*60);for(let i=0;i<n;i++){const x=this.rig.target.x+(Math.random()-.5)*16,z=this.rig.target.z+(Math.random()-.5)*14,gy=Math.max(0,this.field.sample(x+6.5,z+5.5));
      this.smoke.spawn({x,y:gy+.02,z,vy:.5,life:.18,size:.03,grow:.2,color:rgb('#dfe8ee'),alpha:.5,gravity:4,sprite:SPRITE.glow});}}
    if(this.fireworks>0&&Math.random()<dt*2.2){
      this.fireworks-=.1;const x=(Math.random()-.5)*10,z=(Math.random()-.5)*8,y=4+Math.random()*2,col=rgb(['#ffd27a','#9ff3ee','#f2a0c0','#c9b8ff'][Math.floor(Math.random()*4)],3);
      for(let i=0;i<46;i++){const a=Math.random()*TAU,b=Math.acos(Math.random()*2-1),sp=1.6+Math.random()*.6;this.additive.spawn({x,y,z,vx:Math.sin(b)*Math.cos(a)*sp,vy:Math.cos(b)*sp,vz:Math.sin(b)*Math.sin(a)*sp,life:1.3,size:.04,stretch:.03,color:col,gravity:1.2,drag:.8,sprite:SPRITE.glow});}
      this.onSound?.('firework',{});
    }
  }
  updateDecals(dt) {
    const arr=this.terrain.uniforms.uDecals.value;
    for(let i=0;i<MAX_DECALS;i++){const d=this.decals[i];if(!d){arr[i].set(0,0,1,0);continue;}d.age+=dt;const f=Math.max(0,1-d.age/26);arr[i].set(d.x,d.z,d.r,d.s*f);}
  }
  draw(dt,realDt=dt){if(!this.w)return;this.update(dt,realDt);this.render();}
  render() {
    const s=this.atmo.state;
    if(this.bloom)this.bloom.render(this.scene,this.camera,.55+s.beam*.12);
    else{this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);}
  }
  update(dt,realDt=dt) {
    this.time+=dt;this.clock+=dt;
    if(this.later.length){for(const l of this.later)l.t-=dt;const due=this.later.filter(l=>l.t<=0);this.later=this.later.filter(l=>l.t>0);for(const l of due)l.run();}
    const s=this.atmo.state,g=this.game;
    this.atmo.setMood(moodFor(g));this.atmo.update(dt,realDt,this.clock,this.camera,this.rig.target);
    this.renderer.toneMappingExposure=s.exposure;
    const wu=this.water.uniforms;wu.uTime.value=this.clock;wu.uAmp.value=s.waves;wu.uChop.value=s.storm;wu.uDeep.value.copy(s.deep);wu.uShallow.value.copy(s.shallow);wu.uBright.value=s.waterBright;
    const tu=this.terrain.uniforms;tu.uTime.value=this.clock;tu.uWet.value=s.wet;tu.uSun.value=clamp(s.keyI/2.5,0,1);tu.uCloud.value=s.clouds*clamp((s.keyI-.9)/1.6,0,1);
    this.mats.wind.uTime.value=this.clock;this.mats.wind.uWind.value=.35+s.wind*1.4;
    const ru=this.rain.uniforms;ru.uTime.value=this.clock;ru.uIntensity.value=s.rain;ru.uCenter.value.copy(this.rig.target);ru.uWind.value.set(1.2+s.wind*2.5,.5+s.wind);this.rain.mesh.visible=s.rain>.02;
    this.syncTowers(dt);this.syncCables(dt);this.syncCreatures(dt);this.syncShells(dt);this.syncMarkers();this.syncLighthouse(dt,s);this.ambient(dt,s);this.updateDecals(dt);
    for(const f of this.flashes){f.t+=dt;f.light.intensity=f.t<f.life?f.peak*(1-f.t/f.life)**2:0;}
    const fx=dt||0,ground=(x,z)=>this.field.sample(x+6.5,z+5.5);
    this.additive.update(fx,ground);this.smoke.update(fx,ground);this.debris.update(fx,ground);this.ribbons.update(fx,this.camera);this.rings.update(fx);this.labels.update(fx);
    this.rig.update(realDt);
  }
  rotateView(steps){this.rig.rotate(steps);}
  zoomView(steps){this.rig.zoomBy(steps);}
  resetView(){this.rig.reset();}
  dispose() {
    this.observer.disconnect();this.rig.dispose();
    for(const view of this.towers.values())view.model.dispose();
    this.scene.traverse(o=>{o.geometry?.dispose?.();for(const m of [o.material].flat())if(m?.isMaterial){m.map?.dispose();m.dispose();}});
    for(const g of Object.values(this.ghosts))g.dispose();for(const m of Object.values(this.warnings)){m.map.dispose();m.dispose();}this.ringGeo.dispose();
    for(const x of [this.additive,this.smoke,this.debris,this.ribbons,this.rings,this.labels,this.rain,this.terrain,this.water,this.bloom])x?.dispose();
    this.atmo.dispose();this.mats.dispose();this.atlas.dispose();this.halo.dispose();this.heightTexture.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss?.();
  }
}

// Build-card icons rendered from the same 3D models, on a short-lived offscreen context.
export function renderTowerIcons(canvases) {
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=144;
  const r=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.NeutralToneMapping;r.toneMappingExposure=1.15;r.setClearColor(0x000000,0);
  const scene=new THREE.Scene(),mats=createMaterials(),cam=new THREE.PerspectiveCamera(30,160/144,.1,50);
  scene.add(new THREE.HemisphereLight('#dfe8f0','#4a4032',1.6));const key=new THREE.DirectionalLight('#fff0d8',2.6);key.position.set(3,5,2);scene.add(key);
  const pmrem=new THREE.PMREMGenerator(r),env=pmrem.fromScene(Object.assign(new THREE.Scene(),{background:new THREE.Color('#8a9aa8')}),0);scene.environment=env.texture;
  for(const icon of canvases){
    const type=icon.dataset.icon,model=buildTower(type,1,mats,{color:TYPES[type].color});
    model.glow.emissiveIntensity=2;if(model.yaw)model.yaw.rotation.y=-.7;scene.add(model.root);
    const h=model.height;cam.position.set(2.1,1.35+h*.5,2.1).multiplyScalar(.62+h*.22);cam.lookAt(0,h*.45,0);
    r.render(scene,cam);const ctx=icon.getContext('2d');ctx.clearRect(0,0,icon.width,icon.height);ctx.drawImage(canvas,0,0,icon.width,icon.height);
    scene.remove(model.root);model.dispose();
  }
  env.dispose();pmrem.dispose();mats.dispose();r.dispose();r.forceContextLoss();
}
