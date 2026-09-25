import * as THREE from 'three';

// A 2×2 atlas: soft glow, smoke puff, four-point star, ring. Drawn once on a canvas.
function atlasTexture() {
  const size=256,half=size/2,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');
  const radial=(cx,cy,stops)=>{const g=ctx.createRadialGradient(cx,cy,0,cx,cy,half/2);for(const [o,c] of stops)g.addColorStop(o,c);ctx.fillStyle=g;ctx.fillRect(cx-half/2,cy-half/2,half,half);};
  radial(half/2,half/2,[[0,'rgba(255,255,255,1)'],[.25,'rgba(255,255,255,.75)'],[.6,'rgba(255,255,255,.18)'],[1,'rgba(255,255,255,0)']]);
  for(let i=0;i<26;i++){
    const a=i*2.4,r=(i%7)/7*22,x=half+half/2+Math.cos(a)*r,y=half/2+Math.sin(a)*r,g=ctx.createRadialGradient(x,y,0,x,y,26-r*.5);
    g.addColorStop(0,'rgba(255,255,255,.16)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
  }
  ctx.save();ctx.translate(half/2,half+half/2);
  for(const [w,l,a] of [[7,60,1],[5,44,.7]]){ctx.globalAlpha=a;for(let k=0;k<4;k++){ctx.rotate(Math.PI/2*(k?1:0)+(w===5&&k===0?Math.PI/4:0));const g=ctx.createLinearGradient(0,0,l,0);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-w);ctx.lineTo(l,0);ctx.lineTo(0,w);ctx.fill();}}
  ctx.restore();ctx.globalAlpha=1;
  const g=ctx.createRadialGradient(half+half/2,half+half/2,0,half+half/2,half+half/2,half/2);
  g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.72,'rgba(255,255,255,0)');g.addColorStop(.86,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(half,half,half,half);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
export const SPRITE={glow:0,smoke:1,star:2,ring:3};

const PARTICLE_VERTEX=`
attribute vec3 iPos,iVel;attribute vec4 iColor,iMisc;varying vec4 vColor;varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vColor=iColor;float cell=iMisc.w;vUv=(uv+vec2(mod(cell,2.),1.-floor(cell/2.)))*.5;
  vec4 mvPosition=modelViewMatrix*vec4(iPos,1.);vec2 q=position.xy;
  if(iMisc.y>0.){vec3 vv=(modelViewMatrix*vec4(iVel,0.)).xyz;float sp=length(vv.xy);vec2 dir=sp>1e-4?vv.xy/sp:vec2(0.,1.);vec2 perp=vec2(-dir.y,dir.x);
    mvPosition.xy+=dir*q.y*(iMisc.x+sp*iMisc.y)+perp*q.x*iMisc.x;}
  else{float c=cos(iMisc.z),s=sin(iMisc.z);mvPosition.xy+=vec2(c*q.x-s*q.y,s*q.x+c*q.y)*iMisc.x;}
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const PARTICLE_FRAGMENT=`
uniform sampler2D uMap;varying vec4 vColor;varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  vec4 t=texture2D(uMap,vUv);gl_FragColor=vec4(vColor.rgb*t.rgb,vColor.a*t.a);
  #ifdef ADDITIVE
  gl_FragColor.rgb*=gl_FragColor.a;
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
  float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
  #ifdef ADDITIVE
  gl_FragColor.rgb*=1.-fogFactor;
  #else
  gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);
  #endif
  #endif
}`;

export class Particles {
  constructor(capacity,texture,additive) {
    this.capacity=capacity;this.count=0;this.list=[];
    const quad=new THREE.PlaneGeometry(1,1),geo=new THREE.InstancedBufferGeometry();
    geo.index=quad.index;geo.setAttribute('position',quad.attributes.position);geo.setAttribute('uv',quad.attributes.uv);
    this.pos=new Float32Array(capacity*3);this.vel=new Float32Array(capacity*3);this.col=new Float32Array(capacity*4);this.misc=new Float32Array(capacity*4);
    for(const [name,array,size] of [['iPos',this.pos,3],['iVel',this.vel,3],['iColor',this.col,4],['iMisc',this.misc,4]]){const a=new THREE.InstancedBufferAttribute(array,size);a.setUsage(THREE.DynamicDrawUsage);geo.setAttribute(name,a);}
    geo.instanceCount=0;this.geometry=geo;
    this.material=new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uMap:{value:null}}]),vertexShader:PARTICLE_VERTEX,fragmentShader:PARTICLE_FRAGMENT,
      transparent:true,depthWrite:false,fog:true,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,defines:additive?{ADDITIVE:''}:{}});
    this.material.uniforms.uMap.value=texture;
    this.mesh=new THREE.Mesh(geo,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=additive?8:7;
  }
  // p: x,y,z, vx,vy,vz, life, size, grow, color [r,g,b] (linear, may exceed 1), to [r,g,b], alpha, gravity, drag, stretch, sprite, spin, ground
  spawn(p) {
    if(this.list.length>=this.capacity)this.list.shift();
    this.list.push({x:p.x,y:p.y,z:p.z,vx:p.vx||0,vy:p.vy||0,vz:p.vz||0,age:0,life:p.life||1,size:p.size||.2,grow:p.grow||0,color:p.color||[1,1,1],to:p.to,alpha:p.alpha??1,
      gravity:p.gravity||0,drag:p.drag||0,stretch:p.stretch||0,sprite:p.sprite||0,rot:p.rot??Math.random()*6.28,spin:p.spin||0,ground:p.ground,fadeIn:p.fadeIn||0});
  }
  update(dt,groundAt) {
    const list=this.list;let n=0;
    for(let i=0;i<list.length;i++){
      const p=list[i];p.age+=dt;if(p.age>=p.life)continue;
      const drag=Math.exp(-p.drag*dt);p.vx*=drag;p.vy=p.vy*drag-p.gravity*dt;p.vz*=drag;
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rot+=p.spin*dt;
      if(p.ground&&groundAt){const g=groundAt(p.x,p.z)+.02;if(p.y<g){p.y=g;p.vy=Math.abs(p.vy)*.25;p.vx*=.6;p.vz*=.6;}}
      list[n++]=p;
    }
    list.length=n;
    for(let i=0;i<n;i++){
      const p=list[i],t=p.age/p.life,k=i*3,c=i*4;
      this.pos[k]=p.x;this.pos[k+1]=p.y;this.pos[k+2]=p.z;this.vel[k]=p.vx;this.vel[k+1]=p.vy;this.vel[k+2]=p.vz;
      const a=p.alpha*(p.fadeIn?Math.min(1,p.age/p.fadeIn):1)*(1-t);
      const col=p.color,to=p.to;
      this.col[c]=to?col[0]+(to[0]-col[0])*t:col[0];this.col[c+1]=to?col[1]+(to[1]-col[1])*t:col[1];this.col[c+2]=to?col[2]+(to[2]-col[2])*t:col[2];this.col[c+3]=a;
      this.misc[c]=p.size+p.grow*p.age;this.misc[c+1]=p.stretch;this.misc[c+2]=p.rot;this.misc[c+3]=p.sprite;
    }
    this.geometry.instanceCount=n;
    for(const name of ['iPos','iVel','iColor','iMisc']){const a=this.geometry.attributes[name];a.clearUpdateRanges();a.addUpdateRange(0,n*a.itemSize);a.needsUpdate=true;}
  }
  clear(){this.list.length=0;}
  dispose(){this.geometry.dispose();this.material.dispose();}
}

// Tumbling fragments that bounce on the terrain.
export class Debris {
  constructor(capacity,shadows) {
    this.list=[];this.capacity=capacity;
    this.mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.5,metalness:.6}),capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.castShadow=shadows;this.mesh.frustumCulled=false;this.mesh.count=0;
    this.mesh.setColorAt(0,new THREE.Color());this.color=new THREE.Color();this.m=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();this.s=new THREE.Vector3();this.v=new THREE.Vector3();
  }
  spawn(x,y,z,color,count,power=1,size=.05) {
    for(let i=0;i<count;i++){
      if(this.list.length>=this.capacity)this.list.shift();
      const a=Math.random()*Math.PI*2,sp=(.8+Math.random()*1.6)*power;
      this.list.push({x,y,z,vx:Math.cos(a)*sp,vy:(1.6+Math.random()*2.2)*power,vz:Math.sin(a)*sp,rx:Math.random()*6,ry:Math.random()*6,rz:0,wx:(Math.random()-.5)*16,wy:(Math.random()-.5)*16,
        size:size*(.6+Math.random()*.9),age:0,life:1.6+Math.random()*1.4,color:new THREE.Color(color).multiplyScalar(.55+Math.random()*.6),rest:false});
    }
  }
  update(dt,groundAt) {
    let n=0;
    for(const d of this.list){
      d.age+=dt;if(d.age>=d.life)continue;
      if(!d.rest){
        d.vy-=6.5*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.rx+=d.wx*dt;d.ry+=d.wy*dt;
        const g=Math.max(groundAt(d.x,d.z),0)+d.size*.5;
        if(d.y<g){d.y=g;if(Math.abs(d.vy)<.6){d.rest=groundAt(d.x,d.z)>0;d.vy=0;}d.vy=Math.abs(d.vy)*.32;d.vx*=.55;d.vz*=.55;d.wx*=.5;d.wy*=.5;}
      }
      const s=d.size*Math.min(1,(d.life-d.age)*3);
      this.m.compose(this.v.set(d.x,d.y,d.z),this.q.setFromEuler(this.e.set(d.rx,d.ry,d.rz)),this.s.set(s,s*.7,s*1.2));
      this.mesh.setMatrixAt(n,this.m);this.mesh.setColorAt(n,d.color);this.list[n++]=d;
    }
    this.list.length=n;this.mesh.count=n;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  clear(){this.list.length=0;this.mesh.count=0;}
  dispose(){this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.dispose();}
}

// Camera-facing ribbons: lightning, frost beams, the beacon lance.
const RIBBON_VERTEX=`attribute vec4 aColor;attribute float aSide;varying vec4 vColor;varying float vSide;void main(){vColor=aColor;vSide=aSide;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const RIBBON_FRAGMENT=`varying vec4 vColor;varying float vSide;void main(){float a=1.-vSide*vSide;gl_FragColor=vec4(vColor.rgb*vColor.a*a*a,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export class Ribbons {
  constructor(capacity=900) {
    this.capacity=capacity;this.bolts=[];
    this.positions=new Float32Array(capacity*4*3);this.colors=new Float32Array(capacity*4*4);this.sides=new Float32Array(capacity*4);
    const index=new Uint32Array(capacity*6);for(let i=0;i<capacity;i++){const v=i*4,k=i*6;index.set([v,v+1,v+2,v+2,v+1,v+3],k);}
    const geo=new THREE.BufferGeometry();geo.setIndex(new THREE.BufferAttribute(index,1));
    geo.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSide',new THREE.BufferAttribute(this.sides,1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0,0);this.geometry=geo;
    this.material=new THREE.ShaderMaterial({vertexShader:RIBBON_VERTEX,fragmentShader:RIBBON_FRAGMENT,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    this.mesh=new THREE.Mesh(geo,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=9;
    this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.dir=new THREE.Vector3();this.view=new THREE.Vector3();this.side=new THREE.Vector3();
  }
  // points: array of THREE.Vector3; jitter re-randomises the path while alive (lightning).
  add(points,{life=.18,width=.05,color=[1,1,1],intensity=2,jitter=0,segments=0,grow=0,fade=true}={}) {
    const bolt={base:points.map(p=>p.clone()),life,age:0,width,color,intensity,jitter,segments,grow,fade,path:null,next:0};
    this.bolts.push(bolt);return bolt;
  }
  static jag(base,jitter,segments) {
    const out=[];
    for(let i=0;i<base.length-1;i++){
      const a=base[i],b=base[i+1],len=a.distanceTo(b),n=Math.max(1,segments||Math.ceil(len/.14));
      for(let k=0;k<n;k++){const t=k/n,p=a.clone().lerp(b,t);if(k>0&&jitter){const f=Math.sin(t*Math.PI)*jitter*Math.min(1,len);p.x+=(Math.random()-.5)*f;p.y+=(Math.random()-.5)*f;p.z+=(Math.random()-.5)*f;}out.push(p);}
    }
    out.push(base.at(-1).clone());return out;
  }
  update(dt,camera) {
    let q=0;const cap=this.capacity;
    this.bolts=this.bolts.filter(b=>(b.age+=dt)<b.life);
    for(const b of this.bolts){
      if(!b.path||(b.jitter&&(b.next-=dt)<=0)){b.path=b.jitter?Ribbons.jag(b.base,b.jitter,b.segments):b.base;b.next=.035;}
      const fade=b.fade?1-b.age/b.life:1,width=b.width*(1+b.grow*b.age);
      for(const [w,k] of [[width*2.6,.35],[width,1]]){
        for(let i=0;i<b.path.length-1&&q<cap;i++){
          this.a.copy(b.path[i]);this.b.copy(b.path[i+1]);this.dir.subVectors(this.b,this.a).normalize();
          this.view.subVectors(camera.position,this.a).normalize();this.side.crossVectors(this.dir,this.view).normalize().multiplyScalar(w/2);
          const v=q*4,P=this.positions,C=this.colors,S=this.sides;
          for(const [j,p,s] of [[0,this.a,-1],[1,this.a,1],[2,this.b,-1],[3,this.b,1]]){
            P[(v+j)*3]=p.x+this.side.x*s;P[(v+j)*3+1]=p.y+this.side.y*s;P[(v+j)*3+2]=p.z+this.side.z*s;
            C[(v+j)*4]=b.color[0];C[(v+j)*4+1]=b.color[1];C[(v+j)*4+2]=b.color[2];C[(v+j)*4+3]=b.intensity*fade*k;S[v+j]=s;
          }
          q++;
        }
      }
    }
    this.geometry.setDrawRange(0,q*6);
    for(const name of ['position','aColor','aSide'])this.geometry.attributes[name].needsUpdate=true;
  }
  clear(){this.bolts.length=0;}
  dispose(){this.geometry.dispose();this.material.dispose();}
}

// Flat shockwave rings on the ground or water.
export class Rings {
  constructor(texture,count=18) {
    this.pool=[];this.group=new THREE.Group();
    const geo=new THREE.PlaneGeometry(2,2);geo.rotateX(-Math.PI/2);this.geo=geo;
    for(let i=0;i<count;i++){
      const mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
      mat.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=vMapUv*.5+vec2(.5,0.);');};
      const m=new THREE.Mesh(geo,mat);m.visible=false;m.renderOrder=6;this.group.add(m);this.pool.push({mesh:m,age:0,life:0});
    }
    this.next=0;
  }
  add(x,y,z,{from=.1,to=1.5,life=.5,color='#ffd9a0',intensity=1.5}={}) {
    const r=this.pool[this.next];this.next=(this.next+1)%this.pool.length;
    Object.assign(r,{age:0,life,from,to,intensity});r.mesh.position.set(x,y,z);r.mesh.visible=true;r.mesh.material.color.set(color);
  }
  update(dt) {
    for(const r of this.pool){
      if(!r.mesh.visible)continue;r.age+=dt;const t=r.age/r.life;
      if(t>=1){r.mesh.visible=false;continue;}
      const s=r.from+(r.to-r.from)*(1-(1-t)**2.2);r.mesh.scale.setScalar(s);r.mesh.material.opacity=(1-t)*r.intensity;
    }
  }
  clear(){for(const r of this.pool)r.mesh.visible=false;}
  dispose(){this.geo.dispose();for(const r of this.pool)r.mesh.material.dispose();}
}

const RAIN_VERTEX=`attribute float aEnd;uniform float uTime,uHeight,uLen;uniform vec3 uCenter;uniform vec2 uWind;varying float vAlpha;
void main(){vec3 p=position;float y=mod(p.y-uTime*9.,uHeight);vec3 w=vec3(uCenter.x+p.x+uWind.x*y*.12,y-.2,uCenter.z+p.z+uWind.y*y*.12);
w+=aEnd*vec3(uWind.x*.06,-uLen,uWind.y*.06);vAlpha=(1.-aEnd*.7)*smoothstep(0.,1.5,y);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
const RAIN_FRAGMENT=`uniform float uIntensity;uniform vec3 uColor;varying float vAlpha;void main(){gl_FragColor=vec4(uColor,vAlpha*uIntensity*.42);
#include <colorspace_fragment>
}`;
export function createRain(count) {
  const pos=new Float32Array(count*6),end=new Float32Array(count*2);
  for(let i=0;i<count;i++){const x=(Math.random()-.5)*26,y=Math.random()*14,z=(Math.random()-.5)*26;pos.set([x,y,z,x,y,z],i*6);end[i*2+1]=1;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aEnd',new THREE.BufferAttribute(end,1));
  const uniforms={uTime:{value:0},uHeight:{value:14},uLen:{value:.34},uCenter:{value:new THREE.Vector3()},uWind:{value:new THREE.Vector2(1.5,.6)},uIntensity:{value:0},uColor:{value:new THREE.Color('#c9d6e3')}};
  const mat=new THREE.ShaderMaterial({uniforms,vertexShader:RAIN_VERTEX,fragmentShader:RAIN_FRAGMENT,transparent:true,depthWrite:false});
  const lines=new THREE.LineSegments(geo,mat);lines.frustumCulled=false;lines.renderOrder=9;
  return {mesh:lines,uniforms,dispose(){geo.dispose();mat.dispose();}};
}

// Floating "+8 ◇" rewards. Textures are cached per label.
export class Labels {
  constructor(count=24) {
    this.cache=new Map();this.pool=[];this.group=new THREE.Group();this.next=0;
    for(let i=0;i<count;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,depthTest:false,opacity:0}));s.visible=false;s.renderOrder=20;this.group.add(s);this.pool.push({sprite:s,age:0,life:1});}
  }
  texture(text,color) {
    const key=text+color;if(this.cache.has(key))return this.cache.get(key);
    const c=document.createElement('canvas');c.width=128;c.height=48;const ctx=c.getContext('2d');
    ctx.font='600 30px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineWidth=6;ctx.strokeStyle='rgba(12,26,26,.75)';ctx.strokeText(text,64,25);ctx.fillStyle=color;ctx.fillText(text,64,25);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;this.cache.set(key,t);return t;
  }
  add(text,x,y,z,color='#f3dc9a',scale=.5) {
    const l=this.pool[this.next];this.next=(this.next+1)%this.pool.length;
    l.sprite.material.map=this.texture(text,color);l.sprite.material.needsUpdate=true;l.sprite.position.set(x,y,z);l.sprite.scale.set(scale*2.67,scale,1);
    l.sprite.visible=true;l.age=0;l.life=1.1;l.y=y;
  }
  update(dt) {
    for(const l of this.pool){if(!l.sprite.visible)continue;l.age+=dt;const t=l.age/l.life;if(t>=1){l.sprite.visible=false;continue;}
      l.sprite.position.y=l.y+t*.55;l.sprite.material.opacity=Math.min(1,(1-t)*2.2);}
  }
  clear(){for(const l of this.pool)l.sprite.visible=false;}
  dispose(){for(const t of this.cache.values())t.dispose();for(const l of this.pool)l.sprite.material.dispose();}
}

export {atlasTexture};
