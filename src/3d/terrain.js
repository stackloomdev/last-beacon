import * as THREE from 'three';
import {PADS,PATH,SOURCE} from '../game.js';

// Game tiles map to world units: x → X, y → Z, centred on the island. Height is world Y; the sea sits at Y = 0.
export const toWorld=(x,y)=>({x:x-6.5,z:y-5.5});
export const fromWorld=(X,Z)=>({x:X+6.5,y:Z+5.5});
export const ROAD_Y=.36,PAD_Y=.44,PAD_TOP=.55,LIGHTHOUSE_Y=.5;
export const COTTAGE={x:12.3,y:6.1},PIER={x:13.2,y:7.35,length:2.9};

const clamp01=v=>v<0?0:v>1?1:v;
export const smoothstep=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
const hash=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s);};
export function noise(x,y) {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
  return (a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v)*2-1;
}
export function fbm(x,y,octaves=4) {let sum=0,amp=.5,f=1;for(let i=0;i<octaves;i++){sum+=noise(x*f,y*f)*amp;f*=2.03;amp*=.5;}return sum;}
export function mulberry(seed) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// The road continues under the waves west of the first tile, so enemies climb out of the sea on a stone slipway.
const ROAD=[[-2.6,4],...PATH];
function segmentDistance(x,y,ax,ay,bx,by) {const dx=bx-ax,dy=by-ay,t=clamp01(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy));return Math.hypot(x-ax-dx*t,y-ay-dy*t);}
export function roadDistance(x,y) {let d=Infinity;for(let i=1;i<ROAD.length;i++)d=Math.min(d,segmentDistance(x,y,...ROAD[i-1],...ROAD[i]));return d;}
export const padDistance=(x,y)=>PADS.reduce((d,p)=>Math.min(d,Math.hypot(x-p.x,y-p.y)),Infinity);
export const islandShape=(x,y)=>Math.hypot((x-6.5)/7.25,(y-5.5)/6.25)+fbm(x*.21+3.1,y*.21-1.7,3)*.11;
const roadLevel=x=>x>1.1?ROAD_Y:-.78+(ROAD_Y+.78)*smoothstep(-1.9,1.1,x);

export function groundHeight(x,y) {
  const e=islandShape(x,y),dRoad=roadDistance(x,y),dPad=padDistance(x,y),dLight=Math.hypot(x-SOURCE.x,y-SOURCE.y);
  const open=clamp01((Math.min(dRoad-1,dPad-1,dLight-1.6,Math.hypot(x-COTTAGE.x,y-COTTAGE.y)-1.3))/1.6);
  const land=.46+fbm(x*.6,y*.6,3)*.05+Math.max(0,fbm(x*.31+7,y*.31+2,3))*.62*open;
  const sea=Math.max(-2.7,-.18-(e-.98)*4.2);
  const cliff=clamp01(fbm(x*.13+11,y*.13+5,2)*1.9+.3);
  const edge=smoothstep(1.03,.84,e)*(1-cliff)+smoothstep(.992,.962,e)*cliff;
  let h=Math.min(sea,land)+(land-Math.min(sea,land))*edge;
  h+=(roadLevel(x)-h)*smoothstep(1,.55,dRoad);
  h+=(PAD_Y-h)*smoothstep(.85,.5,dPad);
  h+=(LIGHTHOUSE_Y-h)*smoothstep(1.55,.95,dLight);
  return h;
}

// A baked height grid keeps picking, placement and the water shader cheap.
export const GRID={x0:-4.5,y0:-4.5,x1:17.5,y1:15.5};
export class HeightField {
  constructor(step) {
    this.step=step;this.nx=Math.round((GRID.x1-GRID.x0)/step)+1;this.ny=Math.round((GRID.y1-GRID.y0)/step)+1;
    this.data=new Float32Array(this.nx*this.ny);
    for(let j=0;j<this.ny;j++)for(let i=0;i<this.nx;i++)this.data[j*this.nx+i]=groundHeight(GRID.x0+i*step,GRID.y0+j*step);
  }
  sample(x,y) {
    const fx=Math.max(0,Math.min(this.nx-1.001,(x-GRID.x0)/this.step)),fy=Math.max(0,Math.min(this.ny-1.001,(y-GRID.y0)/this.step));
    const i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,d=this.data,n=this.nx;
    return (d[j*n+i]*(1-u)+d[j*n+i+1]*u)*(1-v)+(d[(j+1)*n+i]*(1-u)+d[(j+1)*n+i+1]*u)*v;
  }
  // March a world-space ray until it dips under the terrain, then refine.
  raycast(origin,dir) {
    let t=0,prev=0;
    for(let k=0;k<400;k++) {
      const X=origin.x+dir.x*t,Y=origin.y+dir.y*t,Z=origin.z+dir.z*t,g=fromWorld(X,Z);
      if(Y<=Math.max(0,this.sample(g.x,g.y))) {
        let a=prev,b=t;
        for(let r=0;r<12;r++){const m=(a+b)/2,Xm=origin.x+dir.x*m,Zm=origin.z+dir.z*m,gm=fromWorld(Xm,Zm);(origin.y+dir.y*m<=Math.max(0,this.sample(gm.x,gm.y))?b=m:a=m);}
        const X2=origin.x+dir.x*b,Z2=origin.z+dir.z*b;return {...fromWorld(X2,Z2),X:X2,Y:origin.y+dir.y*b,Z:Z2};
      }
      prev=t;t+=Math.max(.04,(Y-1.2)*.25);if(t>300)break;
    }
    return null;
  }
  texture() {
    const size=256,bytes=new Uint8Array(size*size*4);
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const x=GRID.x0+(GRID.x1-GRID.x0)*i/(size-1),y=GRID.y0+(GRID.y1-GRID.y0)*j/(size-1),h=this.sample(x,y),k=(j*size+i)*4;
      bytes[k]=Math.round(clamp01((h+3)/5)*255);bytes[k+3]=255;
    }
    const tex=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
    tex.magFilter=tex.minFilter=THREE.LinearFilter;tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.needsUpdate=true;
    return tex;
  }
}

function detailTexture() {
  const size=256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'),img=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const n=fbm(x/9,y/9,4)*.5+fbm(x/2.2,y/2.2,2)*.5,g=Math.max(0,Math.min(255,222+n*62)),k=(y*size+x)*4;
    img.data[k]=img.data[k+1]=img.data[k+2]=g;img.data[k+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  return tex;
}

const C=hex=>new THREE.Color(hex);
const PALETTE={grassA:C('#4d6a35'),grassB:C('#68853f'),grassC:C('#7f9150'),dry:C('#9a955d'),road:C('#8c7658'),roadLight:C('#a58f6b'),rut:C('#6d5b45'),
  gravel:C('#8f8d7f'),sand:C('#d3c196'),wetSand:C('#a39170'),rock:C('#7b766b'),rockDark:C('#5f5b53'),seabed:C('#b8a67c'),deep:C('#4f5a52'),stone:C('#9e9c8f')};

export const MAX_DECALS=16;
export function createTerrain(field,quality) {
  const step=quality==='high'?.085:quality==='medium'?.12:.16;
  const w=GRID.x1-GRID.x0,d=GRID.y1-GRID.y0,sx=Math.round(w/step),sy=Math.round(d/step);
  const geo=new THREE.PlaneGeometry(w,d,sx,sy);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<pos.count;i++){
    const X=pos.getX(i)+(GRID.x0+GRID.x1)/2-6.5,Z=pos.getZ(i)+(GRID.y0+GRID.y1)/2-5.5,g=fromWorld(X,Z);
    pos.setXYZ(i,X,groundHeight(g.x,g.y),Z);uv.setXY(i,X*.55,Z*.55);
  }
  geo.computeVertexNormals();
  const colors=new Float32Array(pos.count*3),normal=geo.attributes.normal,c=new THREE.Color(),roadColor=new THREE.Color();
  for(let i=0;i<pos.count;i++){
    const X=pos.getX(i),h=pos.getY(i),Z=pos.getZ(i),g=fromWorld(X,Z),slope=1-normal.getY(i);
    const dRoad=roadDistance(g.x,g.y),dPad=padDistance(g.x,g.y),n=fbm(g.x*.8,g.y*.8,3),n2=noise(g.x*3.1,g.y*3.1);
    c.copy(PALETTE.grassA).lerp(PALETTE.grassB,clamp01(.5+n*1.4)).lerp(PALETTE.grassC,clamp01(n2*.8)*.5).lerp(PALETTE.dry,clamp01(fbm(g.x*.27+9,g.y*.27,2)*2.2-.35));
    c.lerp(PALETTE.sand,smoothstep(.3,.12,h)).lerp(PALETTE.wetSand,smoothstep(.1,.01,h));
    if(h<0)c.copy(PALETTE.seabed).lerp(PALETTE.deep,smoothstep(-.1,-1.6,h));
    c.lerp(n2>0?PALETTE.rock:PALETTE.rockDark,smoothstep(.22,.42,slope));
    const road=smoothstep(.62,.36,dRoad);
    if(road>0)c.lerp(roadColor.copy(PALETTE.road).lerp(PALETTE.roadLight,clamp01(.5+n2*.6)).lerp(PALETTE.rut,Math.abs(dRoad-.2)<.05?.35:0),road*(h<-.05?.35:1));
    c.lerp(PALETTE.gravel,smoothstep(.62,.46,dPad)*.9);
    c.lerp(PALETTE.stone,smoothstep(1.25,.9,Math.hypot(g.x-SOURCE.x,g.y-SOURCE.y))*.7);
    colors.set([c.r,c.g,c.b],i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const detail=detailTexture();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0,map:detail,bumpMap:detail,bumpScale:1.4});
  const uniforms={uTime:{value:0},uWet:{value:0},uSun:{value:1},uCloud:{value:0},uRange:{value:new THREE.Vector4(0,0,0,0)},uRangeColor:{value:new THREE.Color('#f1d697')},
    uAim:{value:new THREE.Vector4(0,0,0,0)},uAimColor:{value:new THREE.Color('#ffe7a3')},uDecals:{value:Array.from({length:MAX_DECALS},()=>new THREE.Vector4())}};
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvGround=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vGround;uniform float uTime,uWet,uSun,uCloud;uniform vec4 uRange,uAim;uniform vec3 uRangeColor,uAimColor;uniform vec4 uDecals[${MAX_DECALS}];
float ringMask(vec2 p,vec4 r,float w){float d=length(p-r.xy);return (1.-smoothstep(w*.5,w,abs(d-r.z)))*step(.01,r.z);}
float caustic(vec2 p){p*=2.3;float t=uTime*.55;float c=sin(p.x+t)*sin(p.y*1.3-t*.8)+sin((p.x+p.y)*1.7+t*1.3)*.6+sin(length(p*.9)*2.1-t)*.4;return pow(max(0.,c*.5),3.);}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
float under=smoothstep(.02,-.25,vGround.y);
diffuseColor.rgb+=vec3(.55,.75,.7)*caustic(vGround.xz)*under*uSun*smoothstep(-1.8,-.1,vGround.y)*.45;
for(int i=0;i<${MAX_DECALS};i++){vec4 dc=uDecals[i];if(dc.w<=0.)continue;float d=length(vGround.xz-dc.xy)/dc.z;float m=(1.-smoothstep(.35,1.,d+.18*sin(atan(vGround.z-dc.y,vGround.x-dc.x)*5.+dc.x*9.)))*dc.w;diffuseColor.rgb*=1.-.72*m;}
float wet=uWet*(1.-under)*smoothstep(-.05,.2,vGround.y);diffuseColor.rgb*=1.-.38*wet;
vec2 cq=vGround.xz*.075+vec2(uTime*.018,uTime*.007);float cl=sin(cq.x*2.1+sin(cq.y*1.7))*sin(cq.y*2.3+cos(cq.x*1.3))+.45*sin((cq.x+cq.y)*3.7);
diffuseColor.rgb*=1.-.3*uCloud*smoothstep(.15,.75,cl);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.28,wet);')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{vec2 p=vGround.xz;float fill=(1.-step(uRange.z,length(p-uRange.xy)))*step(.01,uRange.z);
totalEmissiveRadiance+=uRangeColor*(ringMask(p,uRange,.06)*.9+fill*.07)*uRange.w;
float pulse=.65+.35*sin(uTime*7.);float aimFill=(1.-smoothstep(uAim.z*.2,uAim.z,length(p-uAim.xy)))*step(.01,uAim.z);
totalEmissiveRadiance+=uAimColor*(ringMask(p,uAim,.09)*1.4*pulse+aimFill*.2)*uAim.w;}`);
  };
  const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;mesh.name='terrain';
  return {mesh,uniforms,dispose(){geo.dispose();mat.dispose();detail.dispose();}};
}

// Deterministic scatter for trees, rocks and grass so every watch shows the same island.
export function scatter(field) {
  const rand=mulberry(4242),trees=[],rocks=[],grass=[],flowers=[];
  const blocked=(x,y,r)=>roadDistance(x,y)<r||padDistance(x,y)<r+.1||Math.hypot(x-SOURCE.x,y-SOURCE.y)<r+.9||Math.hypot(x-COTTAGE.x,y-COTTAGE.y)<r+.6||(Math.abs(y-PIER.y)<.8&&x>PIER.x-1.4);
  for(let y=-1;y<=12.5;y+=.52)for(let x=-1;x<=14;x+=.52){
    const px=x+(rand()-.5)*.45,py=y+(rand()-.5)*.45,h=field.sample(px,py);
    if(h<.34||blocked(px,py,.85))continue;
    const forest=fbm(px*.35+20,py*.35-4,2);
    if(forest>.02&&rand()<.55+forest)trees.push({x:px,y:py,h,scale:.55+rand()*.45,kind:rand()<.72?'pine':'broad',rot:rand()*Math.PI*2});
  }
  for(let i=0;i<260&&rocks.length<70;i++){
    const px=-1.5+rand()*16,py=-1.5+rand()*14,h=field.sample(px,py);
    if(h<-.45||h>.6||blocked(px,py,.7))continue;
    const edge=h<.3;if(!edge&&rand()<.8)continue;
    rocks.push({x:px,y:py,h,scale:.12+rand()*(edge?.3:.18),rot:rand()*Math.PI*2,tilt:rand()*.4});
  }
  for(let i=0;i<9000&&grass.length<2600;i++){
    const px=-1+rand()*15,py=-1+rand()*13,h=field.sample(px,py);
    if(h<.3||blocked(px,py,.5))continue;
    grass.push({x:px,y:py,h,scale:.6+rand()*.7,rot:rand()*Math.PI*2,tint:rand()});
    if(rand()<.1)flowers.push({x:px+(rand()-.5)*.2,y:py+(rand()-.5)*.2,h,color:rand()});
  }
  return {trees,rocks,grass,flowers};
}
