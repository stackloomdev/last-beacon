import * as THREE from 'three';
import {GRID} from './terrain.js';

// Shared GLSL: a few directional swells plus their analytic slope, reused by vertex displacement and per-pixel normals.
const WAVES=`
uniform float uTime,uAmp,uChop;uniform sampler2D uHeight;uniform vec4 uHeightRect;
float terrainAt(vec2 p){vec2 uv=(p-uHeightRect.xy)*uHeightRect.zw;return texture2D(uHeight,clamp(uv,0.,1.)).r*5.-3.;}
const vec4 W0=vec4(.8,.6,1.05,.050),W1=vec4(-.55,.84,1.62,.030),W2=vec4(.31,-.95,2.7,.016),W3=vec4(-.92,-.39,4.1,.008);
float swell(vec2 p,vec4 w,float s){return sin(dot(p,w.xy)*w.z+uTime*s)*w.w;}
vec2 swellGrad(vec2 p,vec4 w,float s){return w.xy*w.z*cos(dot(p,w.xy)*w.z+uTime*s)*w.w;}
float waveHeight(vec2 p){return swell(p,W0,1.25)+swell(p,W1,1.8)+swell(p,W2,2.5)+swell(p,W3,3.3);}
vec2 waveGrad(vec2 p){return swellGrad(p,W0,1.25)+swellGrad(p,W1,1.8)+swellGrad(p,W2,2.5)+swellGrad(p,W3,3.3);}
`;

export function createWater(heightTexture,quality) {
  // Graded grid: fine near the island for visible swell, stretched outwards to reach the horizon.
  const seg=quality==='high'?240:quality==='medium'?170:110,geo=new THREE.PlaneGeometry(2,2,seg,seg);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,stretch=t=>Math.sign(t)*(34*Math.abs(t)+566*Math.abs(t)**5);
  for(let i=0;i<pos.count;i++)pos.setXYZ(i,stretch(pos.getX(i)),0,stretch(pos.getZ(i)));
  geo.computeBoundingSphere();
  const w=GRID.x1-GRID.x0,d=GRID.y1-GRID.y0;
  const uniforms={uTime:{value:0},uAmp:{value:1},uChop:{value:0},uHeight:{value:heightTexture},uHeightRect:{value:new THREE.Vector4(GRID.x0-6.5,GRID.y0-5.5,1/w,1/d)},
    uDeep:{value:new THREE.Color('#123f52')},uShallow:{value:new THREE.Color('#2f8d8b')},uFoam:{value:new THREE.Color('#eef4ee')},uBright:{value:.5}};
  const mat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.1,metalness:0,transparent:true,envMapIntensity:1.1});
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${WAVES}\nvarying vec3 vWater;`)
      .replace('#include <begin_vertex>',`vec3 transformed=vec3(position);
float depth0=max(0.,-terrainAt(transformed.xz));
transformed.y+=waveHeight(transformed.xz)*uAmp*smoothstep(0.,.55,depth0)*(1.-smoothstep(26.,48.,length(transformed.xz)));
vWater=transformed;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${WAVES}
varying vec3 vWater;uniform vec3 uDeep,uShallow,uFoam;uniform float uBright;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x),mix(hash12(i+vec2(0,1)),hash12(i+1.),f.x),f.y);}`)
      .replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
float fade=1.-smoothstep(30.,160.,length(vWater.xz-cameraPosition.xz));
vec2 grad=waveGrad(vWater.xz)*uAmp*smoothstep(0.,.55,depth);
vec2 q=vWater.xz*3.1+vec2(uTime*.35,uTime*.21);
grad+=(vec2(vnoise(q+vec2(.13,0))-vnoise(q-vec2(.13,0)),vnoise(q+vec2(0,.13))-vnoise(q-vec2(0,.13))))*(.22+.18*uChop)*fade;
vec2 r=vWater.xz*7.3-vec2(uTime*.6,-uTime*.45);
grad+=(vec2(vnoise(r+vec2(.1,0))-vnoise(r-vec2(.1,0)),vnoise(r+vec2(0,.1))-vnoise(r-vec2(0,.1))))*.08*fade;
vec3 waterN=normalize(vec3(-grad.x,1.,-grad.y));
normal=normalize((viewMatrix*vec4(waterN,0.)).xyz);nonPerturbedNormal=normal;`)
      .replace('#include <color_fragment>',`#include <color_fragment>
float ground=terrainAt(vWater.xz),depth=vWater.y-ground;
vec3 waterCol=mix(uShallow,uDeep,smoothstep(.05,2.4,depth));
waterCol=mix(uShallow*1.35+vec3(.05,.08,.06),waterCol,smoothstep(0.,.4,depth));
float n=vnoise(vWater.xz*2.6+uTime*.12)*.6+vnoise(vWater.xz*6.-uTime*.2)*.4;
float shore=1.-smoothstep(0.,.16+.08*n,depth);
float bands=smoothstep(.72,.98,sin(depth*15.-uTime*1.9+n*3.)*.5+.5)*(1.-smoothstep(.02,.5,depth))*smoothstep(.35,.6,n+.2);
float streak=vnoise(vWater.xz*vec2(9.,3.)+uTime*.3);float crest=smoothstep(.11,.16,waveHeight(vWater.xz)*uAmp)*uChop*smoothstep(.55,.85,n)*smoothstep(.45,.75,streak);
float foam=clamp(shore*.95+bands*.75+crest*.5,0.,1.);
diffuseColor.rgb=mix(waterCol*(.75+.5*uBright),uFoam,foam);
diffuseColor.a=max(mix(.55,1.,smoothstep(0.,1.6,depth)),foam*.95);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor+.06*uChop,.7,foam);');
  };
  const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.renderOrder=1;mesh.name='sea';
  return {mesh,uniforms,dispose(){geo.dispose();mat.dispose();}};
}
