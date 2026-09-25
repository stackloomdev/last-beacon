import * as THREE from 'three';

// Each wave has its own light: dusk settles into night, a storm front rolls in, the colossus brings a red dark, victory brings dawn.
const MOODS={
  dusk:{top:'#3a5b80',horizon:'#e7a27a',bottom:'#2c4a56',sun:[212,7],sunColor:'#ffb27a',sunGlow:1,moon:[60,25],moonGlow:0,stars:0,clouds:.42,cloudColor:'#f2b89a',cloudShadow:'#6d6a80',
    key:[128,30],keyColor:'#ffd2a0',keyI:2.7,hemiSky:'#a8bcd6',hemiGround:'#5f4e3c',hemiI:1.05,fogNear:30,fogFar:105,env:.95,exposure:1,beam:.5,rain:0,storm:0,waves:1,wind:.35,wet:0,deep:'#123f52',shallow:'#2f8d8b',waterBright:.6,lamps:.25},
  sunset:{top:'#2c476e',horizon:'#df895d',bottom:'#263f4c',sun:[210,2],sunColor:'#ff8f55',sunGlow:1,moon:[60,25],moonGlow:0,stars:.05,clouds:.5,cloudColor:'#e59a7a',cloudShadow:'#57506e',
    key:[130,19],keyColor:'#ffb784',keyI:2.2,hemiSky:'#8a9fc4',hemiGround:'#4d3f3a',hemiI:.95,fogNear:28,fogFar:98,env:.78,exposure:1,beam:.75,rain:0,storm:0,waves:1.05,wind:.4,wet:0,deep:'#10384b',shallow:'#2a7f80',waterBright:.5,lamps:.5},
  gloaming:{top:'#1f3358',horizon:'#b26e5f',bottom:'#1e3340',sun:[208,-2],sunColor:'#ff7a4a',sunGlow:.7,moon:[62,20],moonGlow:.3,stars:.18,clouds:.45,cloudColor:'#b77a78',cloudShadow:'#3e3f5c',
    key:[128,15],keyColor:'#f0aa8c',keyI:1.5,hemiSky:'#7489b3',hemiGround:'#3d3540',hemiI:.85,fogNear:26,fogFar:92,env:.58,exposure:1.02,beam:1,rain:0,storm:0,waves:1.05,wind:.45,wet:0,deep:'#0e3244',shallow:'#276f74',waterBright:.42,lamps:.8},
  blue:{top:'#132244',horizon:'#4a5a86',bottom:'#16283a',sun:[205,-8],sunColor:'#ff7a4a',sunGlow:.22,moon:[62,25],moonGlow:.65,stars:.45,clouds:.35,cloudColor:'#51608a',cloudShadow:'#26304a',
    key:[70,48],keyColor:'#b4c8f0',keyI:1.5,hemiSky:'#6d80b0',hemiGround:'#2e3242',hemiI:1.12,fogNear:24,fogFar:86,env:0.55,exposure:1.1,beam:1.3,rain:0,storm:0,waves:1.1,wind:.5,wet:0,deep:'#0b2a3c',shallow:'#20606a',waterBright:.35,lamps:1},
  night:{top:'#070f24',horizon:'#1d2a48',bottom:'#0b1622',sun:[200,-15],sunColor:'#ff7a4a',sunGlow:0,moon:[64,36],moonGlow:1,stars:1,clouds:.28,cloudColor:'#3a4868',cloudShadow:'#161c2c',
    key:[62,55],keyColor:'#b3c6f2',keyI:1.5,hemiSky:'#62749f',hemiGround:'#2a3040',hemiI:1.15,fogNear:26,fogFar:80,env:0.5,exposure:1.18,beam:1.7,rain:0,storm:0,waves:1.15,wind:.5,wet:0,deep:'#081f30',shallow:'#1a4f5c',waterBright:.3,lamps:1},
  deep:{top:'#040914',horizon:'#141d33',bottom:'#070d16',sun:[200,-20],sunColor:'#ff7a4a',sunGlow:0,moon:[40,22],moonGlow:.85,stars:1,clouds:.2,cloudColor:'#2e3a58',cloudShadow:'#10141f',
    key:[48,50],keyColor:'#a9bfee',keyI:1.28,hemiSky:'#5a6c96',hemiGround:'#262b3a',hemiI:1.02,fogNear:22,fogFar:66,env:0.42,exposure:1.2,beam:1.9,rain:0,storm:0,waves:1.2,wind:.55,wet:0,deep:'#061a28',shallow:'#174452',waterBright:.26,lamps:1},
  storm:{top:'#0b1016',horizon:'#232b33',bottom:'#0d1216',sun:[200,-20],sunColor:'#ff7a4a',sunGlow:0,moon:[64,36],moonGlow:0,stars:0,clouds:1,cloudColor:'#2e363e',cloudShadow:'#11161b',
    key:[72,58],keyColor:'#aebccb',keyI:1.12,hemiSky:'#5c6a7a',hemiGround:'#252a30',hemiI:1.08,fogNear:12,fogFar:52,env:0.45,exposure:1.18,beam:1.9,rain:1,storm:1,waves:2.3,wind:1,wet:1,deep:'#0c2a36',shallow:'#2a5f62',waterBright:.3,lamps:1},
  drizzle:{top:'#0a1220',horizon:'#27324b',bottom:'#0c1520',sun:[200,-20],sunColor:'#ff7a4a',sunGlow:0,moon:[58,30],moonGlow:.5,stars:.3,clouds:.7,cloudColor:'#34405a',cloudShadow:'#141a26',
    key:[60,52],keyColor:'#adc0ea',keyI:1.28,hemiSky:'#5c6c92',hemiGround:'#282c3a',hemiI:1.08,fogNear:16,fogFar:64,env:0.45,exposure:1.18,beam:1.9,rain:.35,storm:.15,waves:1.5,wind:.65,wet:.8,deep:'#08202f',shallow:'#1b4a57',waterBright:.28,lamps:1},
  abyss:{top:'#0b060e',horizon:'#3b1a22',bottom:'#12080c',sun:[200,-20],sunColor:'#ff7a4a',sunGlow:0,moon:[50,26],moonGlow:.4,stars:.45,clouds:.55,cloudColor:'#4a2230',cloudShadow:'#1a0c12',
    key:[58,50],keyColor:'#e0a6a6',keyI:1.22,hemiSky:'#7a4e5e',hemiGround:'#2e1e24',hemiI:1.06,fogNear:14,fogFar:58,env:0.42,exposure:1.2,beam:2.1,rain:0,storm:.06,waves:1.6,wind:.5,wet:.15,deep:'#1a1628',shallow:'#3e3448',waterBright:.3,lamps:1},
  dawn:{top:'#5d8ac0',horizon:'#ffd3a6',bottom:'#3a5a66',sun:[248,9],sunColor:'#ffd9a0',sunGlow:1,moon:[60,25],moonGlow:0,stars:0,clouds:.35,cloudColor:'#ffd6b8',cloudShadow:'#8a8aa0',
    key:[138,26],keyColor:'#ffe2b6',keyI:2.9,hemiSky:'#bdd0ea',hemiGround:'#6a5a48',hemiI:1.1,fogNear:34,fogFar:120,env:1,exposure:1.02,beam:.22,rain:0,storm:0,waves:.9,wind:.3,wet:.25,deep:'#1b5268',shallow:'#3aa39a',waterBright:.75,lamps:.2},
  lost:{top:'#06080c',horizon:'#1b1e24',bottom:'#0a0c10',sun:[200,-20],sunColor:'#ff7a4a',sunGlow:0,moon:[60,25],moonGlow:.2,stars:.3,clouds:.85,cloudColor:'#2a2d33',cloudShadow:'#0e1014',
    key:[60,50],keyColor:'#8894a6',keyI:0.8,hemiSky:'#4c5260',hemiGround:'#1e2026',hemiI:0.85,fogNear:11,fogFar:48,env:0.3,exposure:1.05,beam:0,rain:.2,storm:0,waves:1.3,wind:.6,wet:.4,deep:'#0a1a22',shallow:'#1d3d44',waterBright:.2,lamps:0}
};
const CAMPAIGN=['dusk','dusk','sunset','gloaming','blue','night','night','deep','storm','drizzle','abyss'];
const ENDLESS=['night','storm','abyss','deep','drizzle'];
export function moodFor(game) {
  if(game.phase==='won')return 'dawn';
  if(game.phase==='lost')return 'lost';
  const upcoming=game.phase==='wave'?game.wave:game.wave+1;
  return upcoming<=10?CAMPAIGN[upcoming]:ENDLESS[(upcoming-11)%ENDLESS.length];
}

const COLOR_KEYS=['top','horizon','bottom','sunColor','cloudColor','cloudShadow','keyColor','hemiSky','hemiGround','deep','shallow'];
const ANGLE_KEYS=['sun','moon','key'];
function parse(mood) {
  const out={};
  for(const [k,v] of Object.entries(mood))out[k]=COLOR_KEYS.includes(k)?new THREE.Color(v):Array.isArray(v)?[...v]:v;
  return out;
}
export const direction=([az,el],out=new THREE.Vector3())=>{const a=THREE.MathUtils.degToRad(az),e=THREE.MathUtils.degToRad(el);return out.set(Math.cos(a)*Math.cos(e),Math.sin(e),Math.sin(a)*Math.cos(e));};

const SKY_VERTEX=`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const SKY_FRAGMENT=`
uniform vec3 uTop,uHorizon,uBottom,uSunDir,uSunColor,uMoonDir,uCloudColor,uCloudShadow;
uniform float uSunGlow,uMoonGlow,uStars,uClouds,uTime,uFlash,uWind;
varying vec3 vDir;
float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=vn(p)*a;p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){
  vec3 d=normalize(vDir);float y=d.y;
  vec3 col=y>0.?mix(uHorizon,uTop,pow(clamp(y,0.,1.),.45)):mix(uHorizon,uBottom,pow(clamp(-y,0.,1.),.35));
  float sd=max(dot(d,uSunDir),0.);
  col+=uSunColor*(pow(sd,5.)*.32+pow(sd,48.)*.55)*uSunGlow;
  col+=uSunColor*smoothstep(.9985,.9992,sd)*3.*uSunGlow;
  float md=max(dot(d,uMoonDir),0.);
  float disc=smoothstep(.99955,.99975,md);
  col+=vec3(.8,.86,1.)*(disc*(1.3-.35*vn(d.xy*900.))+pow(md,90.)*.18+pow(md,12.)*.05)*uMoonGlow;
  if(uStars>0.&&y>0.){
    vec2 g=vec2(atan(d.z,d.x)*95.,asin(y)*95.);vec2 c=floor(g);float r=h21(c);
    float tw=.55+.45*sin(uTime*(1.5+r*3.)+r*40.);
    col+=vec3(.85,.9,1.)*step(.985,r)*smoothstep(.42,.05,length(fract(g)-.5))*tw*uStars*smoothstep(.0,.25,y)*(1.-disc);
  }
  float cover=0.;
  if(y>-.03&&uClouds>0.){
    vec2 uv=d.xz/(y+.14)*1.1+vec2(uTime*.006,uTime*.0025)*(1.+uWind*2.);
    float n=fbm(uv);cover=smoothstep(1.02-uClouds*.72,1.2-uClouds*.5,n+.18)*smoothstep(-.03,.14,y);
    float lit=clamp(dot(normalize(vec3(uSunDir.x,.2,uSunDir.z)),vec3(d.x,0.,d.z))*.5+.5,0.,1.);
    vec3 cc=mix(uCloudShadow,uCloudColor,clamp(n*1.25-.2+lit*.35*uSunGlow,0.,1.));
    col=mix(col,cc,cover*.92);
  }
  col+=vec3(.62,.68,.85)*uFlash*(.35+.9*cover);
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Atmosphere {
  constructor(renderer,scene,{shadowSize=0}={}) {
    this.renderer=renderer;this.scene=scene;this.name=null;this.flash=0;this.flashTimer=6;this.onLightning=null;
    this.current=parse(MOODS.dusk);this.target=parse(MOODS.dusk);
    this.uniforms={uTop:{value:new THREE.Color()},uHorizon:{value:new THREE.Color()},uBottom:{value:new THREE.Color()},uSunDir:{value:new THREE.Vector3()},uSunColor:{value:new THREE.Color()},
      uMoonDir:{value:new THREE.Vector3()},uCloudColor:{value:new THREE.Color()},uCloudShadow:{value:new THREE.Color()},uSunGlow:{value:0},uMoonGlow:{value:0},uStars:{value:0},uClouds:{value:0},uTime:{value:0},uFlash:{value:0},uWind:{value:0}};
    this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:SKY_VERTEX,fragmentShader:SKY_FRAGMENT,side:THREE.BackSide,depthWrite:false,fog:false});
    this.geometry=new THREE.SphereGeometry(400,48,24);
    this.sky=new THREE.Mesh(this.geometry,this.material);this.sky.frustumCulled=false;this.sky.renderOrder=-10;scene.add(this.sky);
    this.envScene=new THREE.Scene();this.envSky=new THREE.Mesh(this.geometry,this.material);this.envScene.add(this.envSky);
    this.pmrem=new THREE.PMREMGenerator(renderer);this.envTarget=null;this.envAge=99;this.envDirty=true;
    this.key=new THREE.DirectionalLight('#ffffff',1);this.key.target.position.set(0,0,0);
    if(shadowSize){
      this.key.castShadow=true;const s=this.key.shadow;s.mapSize.set(shadowSize,shadowSize);s.radius=3;s.bias=-.0004;s.normalBias=.025;
      Object.assign(s.camera,{left:-11,right:11,top:11,bottom:-11,near:1,far:70});s.camera.updateProjectionMatrix();
    }
    this.hemi=new THREE.HemisphereLight('#ffffff','#444444',1);
    scene.add(this.key,this.key.target,this.hemi);
    scene.fog=new THREE.Fog('#ffffff',30,100);
    this.keyDir=new THREE.Vector3();this.apply(0);
  }
  setMood(name,snap=false) {
    if(name===this.name&&!snap)return;
    this.name=name;this.target=parse(MOODS[name]);
    if(snap){this.current=parse(MOODS[name]);this.envDirty=true;}
  }
  get state() {return this.current;}
  lerp(k) {
    const c=this.current,t=this.target;let moving=0;
    for(const key of Object.keys(t)) {
      if(COLOR_KEYS.includes(key)){moving+=Math.abs(c[key].r-t[key].r)+Math.abs(c[key].g-t[key].g)+Math.abs(c[key].b-t[key].b);c[key].lerp(t[key],k);}
      else if(ANGLE_KEYS.includes(key)){for(let i=0;i<2;i++){moving+=Math.abs(c[key][i]-t[key][i])/90;c[key][i]+=(t[key][i]-c[key][i])*k;}}
      else{moving+=Math.abs(c[key]-t[key])/(key.startsWith('fog')?60:2);c[key]+=(t[key]-c[key])*k;}
    }
    return moving;
  }
  apply(time) {
    const s=this.current,u=this.uniforms;
    u.uTop.value.copy(s.top);u.uHorizon.value.copy(s.horizon);u.uBottom.value.copy(s.bottom);
    direction(s.sun,u.uSunDir.value);direction(s.moon,u.uMoonDir.value);u.uSunColor.value.copy(s.sunColor);
    u.uCloudColor.value.copy(s.cloudColor);u.uCloudShadow.value.copy(s.cloudShadow);
    u.uSunGlow.value=s.sunGlow;u.uMoonGlow.value=s.moonGlow;u.uStars.value=s.stars;u.uClouds.value=s.clouds;u.uTime.value=time;u.uFlash.value=this.flash;u.uWind.value=s.wind;
    direction(s.key,this.keyDir);
    this.key.color.copy(s.keyColor);this.key.intensity=s.keyI*(1+this.flash*1.6);
    this.hemi.color.copy(s.hemiSky);this.hemi.groundColor.copy(s.hemiGround);this.hemi.intensity=s.hemiI+this.flash*2.2;
    this.scene.fog.color.copy(s.horizon);this.scene.fog.near=s.fogNear;this.scene.fog.far=s.fogFar;
    this.scene.environmentIntensity=s.env;
  }
  update(dt,realDt,time,camera,focus) {
    const moving=this.lerp(1-Math.exp(-realDt*.45));
    if(this.current.storm>.25&&dt>0) {
      this.flashTimer-=dt;
      if(this.flashTimer<=0){this.flashTimer=3.5+Math.random()*9/this.current.storm;this.flashT=0;this.onLightning?.(this.current.storm);}
    }
    if(this.flashT!==undefined){this.flashT+=realDt;const t=this.flashT;this.flash=t<.08?1:t<.16?.25:t<.26?.85:Math.max(0,.85*(1-(t-.26)/.45));if(t>.8){this.flash=0;this.flashT=undefined;}}
    this.apply(time);
    this.sky.position.copy(camera.position);
    this.key.position.copy(focus).addScaledVector(this.keyDir,32);this.key.target.position.copy(focus);
    this.envAge+=realDt;
    if(this.envDirty||(moving>.02&&this.envAge>1.2)) {
      this.envAge=0;this.envDirty=false;
      const next=this.pmrem.fromScene(this.envScene,0,.1,1000,{size:128});
      this.scene.environment=next.texture;this.envTarget?.dispose();this.envTarget=next;
    }
  }
  dispose() {this.pmrem.dispose();this.envTarget?.dispose();this.geometry.dispose();this.material.dispose();this.scene.remove(this.sky,this.key,this.key.target,this.hemi);}
}
