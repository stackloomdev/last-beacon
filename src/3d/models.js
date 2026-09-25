import * as THREE from 'three';

const TAU=Math.PI*2;
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_s=new THREE.Vector3(),_p=new THREE.Vector3(),_d=new THREE.Vector3(),_up=new THREE.Vector3(0,1,0);

// Every model is assembled from primitives baked into one vertex-coloured geometry per material.
export function part(geometry,color,{p=[0,0,0],r=[0,0,0],s=[1,1,1]}={}) {
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();
  g.applyMatrix4(_m.compose(_p.set(...p),_q.setFromEuler(_e.set(...r)),_s.set(...s)));
  const c=new THREE.Color(color),n=g.attributes.position.count,col=new Float32Array(n*3);
  for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  return g;
}
// A box or cylinder stretched between two points: struts, legs, pipes, cables.
export function strut(a,b,thickness,color,round=false) {
  const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),len=va.distanceTo(vb);
  const g=round?new THREE.CylinderGeometry(thickness,thickness,len,6):new THREE.BoxGeometry(thickness,len,thickness);
  g.applyQuaternion(_q.setFromUnitVectors(_up,_d.subVectors(vb,va).normalize()));
  g.translate((va.x+vb.x)/2,(va.y+vb.y)/2,(va.z+vb.z)/2);
  return part(g,color);
}
export function merge(parts) {
  let count=0;for(const g of parts)count+=g.attributes.position.count;
  const pos=new Float32Array(count*3),nor=new Float32Array(count*3),col=new Float32Array(count*3);let o=0;
  for(const g of parts){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);col.set(g.attributes.color.array,o*3);o+=g.attributes.position.count;g.dispose();}
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));out.setAttribute('color',new THREE.BufferAttribute(col,3));
  out.computeBoundingSphere();return out;
}
const mesh=(parts,material,shadow=true)=>{const m=new THREE.Mesh(merge(parts),material);m.castShadow=shadow;m.receiveShadow=true;return m;};

export function createMaterials() {
  const std=o=>new THREE.MeshStandardMaterial({vertexColors:true,...o});
  const wind={uTime:{value:0},uWind:{value:.4}};
  const foliage=std({roughness:.86,metalness:0});
  foliage.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,wind);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime,uWind;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
float sway=sin(uTime*1.6+instanceMatrix[3].x*.8+instanceMatrix[3].z*.6)+sin(uTime*2.9+instanceMatrix[3].z*1.3)*.35;
transformed.xz+=vec2(sway,sway*.6)*uWind*.07*max(0.,position.y);
#endif`);
  };
  return {
    wind,foliage,
    stone:std({roughness:.9,metalness:.02}),metal:std({roughness:.38,metalness:.78}),paint:std({roughness:.55,metalness:.3}),
    wood:std({roughness:.84,metalness:0}),rock:std({roughness:.96,metalness:0,flatShading:true}),
    creature:std({roughness:.42,metalness:.6}),
    glass:new THREE.MeshStandardMaterial({color:'#fff4d8',roughness:.05,metalness:.1,transparent:true,opacity:.26,depthWrite:false}),
    cable:new THREE.MeshStandardMaterial({color:'#1b2023',roughness:.6,metalness:.2,emissive:new THREE.Color('#000000')}),
    ghost:std({transparent:true,opacity:.62,depthWrite:false,emissive:new THREE.Color('#cfe3b0'),emissiveIntensity:.55,roughness:.4}),
    glowBasic:new THREE.MeshBasicMaterial({color:'#ffffff'}),
    dispose(){for(const m of Object.values(this))if(m?.isMaterial)m.dispose();}
  };
}
export const glowMaterial=(color,intensity=2)=>new THREE.MeshStandardMaterial({color:'#20262a',emissive:new THREE.Color(color),emissiveIntensity:intensity,roughness:.3,metalness:.2});

// ————— Lighthouse —————
const BEAM_VERTEX=`varying float vAlong;varying vec3 vN,vView;uniform float uLength;
void main(){vAlong=clamp(position.x/uLength,0.,1.);vec4 wp=modelMatrix*vec4(position,1.);vView=normalize(cameraPosition-wp.xyz);vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*wp;}`;
const BEAM_FRAGMENT=`varying float vAlong;varying vec3 vN,vView;uniform vec3 uColor;uniform float uIntensity,uTime;
void main(){float edge=pow(abs(dot(normalize(vN),normalize(vView))),2.4);float fall=pow(1.-vAlong,2.2)*smoothstep(0.,.12,vAlong);
float dust=.82+.18*sin(vAlong*37.-uTime*1.7)*sin(vAlong*13.+uTime*.9);gl_FragColor=vec4(uColor*edge*fall*dust*uIntensity,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function beamMaterial(color='#ffe3a6') {
  return new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(color)},uIntensity:{value:1},uTime:{value:0},uLength:{value:1}},vertexShader:BEAM_VERTEX,fragmentShader:BEAM_FRAGMENT,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
}
export function beamGeometry(radius,length,segments=28) {
  const g=new THREE.ConeGeometry(radius,length,segments,8,true);g.translate(0,-length/2,0);g.rotateZ(Math.PI/2);return g;
}
export function buildLighthouse(mats) {
  const group=new THREE.Group(),stone=[],paint=[],metal=[],dark=[];
  stone.push(part(new THREE.CylinderGeometry(.8,.9,.32,8),'#a8a28f',{p:[0,.16,0]}),part(new THREE.CylinderGeometry(.66,.74,.12,8),'#bfb8a3',{p:[0,.38,0]}));
  const bands=[[.44,1.08,'#ebe3cb'],[1.08,1.4,'#b44e3b'],[1.4,2.06,'#ebe3cb'],[2.06,2.36,'#b44e3b']],radius=y=>.52-(y-.44)/1.92*.16;
  for(const [y0,y1,c] of bands)paint.push(part(new THREE.CylinderGeometry(radius(y1),radius(y0),y1-y0,24),c,{p:[0,(y0+y1)/2,0]}));
  stone.push(part(new THREE.CylinderGeometry(.46,.36,.14,24),'#ddd5bf',{p:[0,2.43,0]}));
  metal.push(part(new THREE.CylinderGeometry(.63,.6,.06,28),'#36443d',{p:[0,2.53,0]}));
  for(let i=0;i<18;i++){const a=i/18*TAU;metal.push(part(new THREE.CylinderGeometry(.009,.009,.2,4),'#2a3430',{p:[Math.cos(a)*.59,2.66,Math.sin(a)*.59]}));}
  metal.push(part(new THREE.TorusGeometry(.59,.013,4,40),'#2a3430',{p:[0,2.76,0],r:[Math.PI/2,0,0]}),part(new THREE.TorusGeometry(.59,.008,4,40),'#2a3430',{p:[0,2.66,0],r:[Math.PI/2,0,0]}));
  metal.push(part(new THREE.CylinderGeometry(.37,.37,.07,20),'#2c3732',{p:[0,2.595,0]}),part(new THREE.CylinderGeometry(.39,.39,.05,20),'#2c3732',{p:[0,3.1,0]}));
  for(let i=0;i<8;i++){const a=i/8*TAU+TAU/16;metal.push(part(new THREE.BoxGeometry(.028,.5,.028),'#232c29',{p:[Math.cos(a)*.345,2.86,Math.sin(a)*.345]}));}
  metal.push(part(new THREE.ConeGeometry(.45,.34,20),'#3e6455',{p:[0,3.29,0]}),part(new THREE.SphereGeometry(.07,10,8),'#2f4a40',{p:[0,3.5,0]}),part(new THREE.CylinderGeometry(.008,.008,.34,4),'#1c2320',{p:[0,3.7,0]}));
  // Door, steps and small windows face the island interior.
  dark.push(part(new THREE.BoxGeometry(.05,.32,.2),'#3b2f27',{p:[-.52,.62,0]}),part(new THREE.CylinderGeometry(.1,.1,.05,12,1,false,0,Math.PI),'#3b2f27',{p:[-.52,.78,0],r:[0,0,Math.PI/2]}));
  for(let i=0;i<3;i++)stone.push(part(new THREE.BoxGeometry(.18,.08,.34),'#b3ad98',{p:[-.78-i*.16,.4-i*.09,0]}));
  const windows=[];
  for(const [y,a] of [[.82,3.4],[1.66,2.4],[2.22,3.9]]){const r=radius(y)+.004;windows.push(part(new THREE.BoxGeometry(.035,.13,.08),'#ffffff',{p:[Math.cos(a)*r,y,Math.sin(a)*r],r:[0,-a,0]}));}
  // Power junction on the plinth, where the island grid starts.
  metal.push(part(new THREE.BoxGeometry(.16,.2,.12),'#58645c',{p:[-.62,.54,.44]}),part(new THREE.CylinderGeometry(.02,.02,.34,6),'#6b5b48',{p:[-.62,.8,.44]}),part(new THREE.CylinderGeometry(.025,.025,.05,6),'#d8d4c4',{p:[-.62,.98,.44]}));
  group.add(mesh(stone,mats.stone),mesh(paint,mats.paint),mesh(metal,mats.metal),mesh(dark,mats.wood));
  const windowMat=new THREE.MeshStandardMaterial({vertexColors:true,color:'#2c2a24',emissive:new THREE.Color('#ffc978'),emissiveIntensity:0,roughness:.4});
  group.add(new THREE.Mesh(merge(windows),windowMat));
  const glass=new THREE.Mesh(new THREE.CylinderGeometry(.335,.335,.46,20,1,true),mats.glass);glass.position.y=2.86;glass.renderOrder=2;group.add(glass);
  const lampMat=new THREE.MeshStandardMaterial({color:'#fff4d6',emissive:new THREE.Color('#ffe2a0'),emissiveIntensity:6,roughness:.2});
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.1,16,12),lampMat);lamp.position.y=2.86;group.add(lamp);
  const lens=new THREE.Group();lens.position.y=2.86;group.add(lens);
  const lensMat=new THREE.MeshStandardMaterial({color:'#e8c890',emissive:new THREE.Color('#ffcf80'),emissiveIntensity:2.5,roughness:.15,metalness:.3,transparent:true,opacity:.85});
  for(const side of [1,-1]){const panel=new THREE.Mesh(new THREE.BoxGeometry(.03,.3,.22),lensMat);panel.position.x=side*.19;lens.add(panel);}
  const beamLength=15,beams=[];
  for(const [scale,strength] of [[1,1],[.72,.45]]){
    const material=beamMaterial();material.uniforms.uLength.value=beamLength*scale;
    const beam=new THREE.Mesh(beamGeometry(1.35*scale,beamLength*scale),material);beam.renderOrder=5;beam.frustumCulled=false;
    beam.rotation.z=-.07;beam.userData.strength=strength;beams.push(beam);
  }
  beams[1].rotation.y=Math.PI;lens.add(...beams);
  const anchor=new THREE.Object3D();anchor.position.set(-.62,.99,.44);group.add(anchor);
  return {group,lamp,lampMat,lens,lensMat,beams,windowMat,anchor,lampY:2.86,
    dispose(){group.traverse(o=>{o.geometry?.dispose();if(o.material&&!Object.values(mats).includes(o.material))o.material.dispose();});}};
}

// ————— Pads —————
export function buildPads(pads,mats,place) {
  const slabGeo=merge([part(new THREE.CylinderGeometry(.44,.48,.11,8),'#9a9c8d',{p:[0,.055,0]}),part(new THREE.CylinderGeometry(.36,.36,.012,8),'#8a8c7e',{p:[0,.114,0]})]);
  const rimGeo=merge([part(new THREE.TorusGeometry(.405,.018,4,8),'#56625c',{p:[0,.108,0],r:[Math.PI/2,0,TAU/16]}),
    ...[0,1,2,3].map(i=>part(new THREE.CylinderGeometry(.025,.025,.04,6),'#46514b',{p:[Math.cos(i*TAU/4+TAU/8)*.33,.12,Math.sin(i*TAU/4+TAU/8)*.33]}))]);
  const slabs=new THREE.InstancedMesh(slabGeo,mats.stone,pads.length),rims=new THREE.InstancedMesh(rimGeo,mats.metal,pads.length);
  pads.forEach((pad,i)=>{const w=place(pad);_m.makeTranslation(w.x,w.y,w.z);slabs.setMatrixAt(i,_m);rims.setMatrixAt(i,_m);});
  slabs.receiveShadow=rims.receiveShadow=true;slabs.castShadow=true;
  return [slabs,rims];
}

// ————— Towers —————
function foundation(color) {
  return [part(new THREE.CylinderGeometry(.33,.36,.12,8),color,{p:[0,.06,0]}),part(new THREE.CylinderGeometry(.27,.29,.045,20),'#4c5853',{p:[0,.14,0]})];
}
function mast(list) {
  list.push(part(new THREE.CylinderGeometry(.016,.022,.62,6),'#6a5642',{p:[-.27,.31,.21]}),part(new THREE.BoxGeometry(.13,.018,.018),'#5d4c3b',{p:[-.27,.58,.21],r:[0,.6,0]}),
    part(new THREE.CylinderGeometry(.018,.022,.05,6),'#dcd8c8',{p:[-.27,.63,.21]}));
  return new THREE.Vector3(-.27,.66,.21);
}
function pips(list,level,color) {for(let i=0;i<level;i++)list.push(part(new THREE.BoxGeometry(.02,.035,.05),color,{p:[.33,.07,(i-(level-1)/2)*.075]}));}

export function buildTower(type,level,mats,{ghost=false,color='#ffffff'}={}) {
  const root=new THREE.Group(),glow=glowMaterial(color,2.2),s=[],m=[],p=[],glowParts=[];
  const out={root,glow,yaw:null,recoil:null,muzzles:[],spin:null,anchor:new THREE.Object3D(),height:1,type,level,orbit:null,crystal:null,emitter:new THREE.Object3D()};
  const add=(parent,list,material)=>{if(list.length)parent.add(mesh(list,ghost?mats.ghost:material,!ghost));};
  const addGlow=(parent,list)=>{if(list.length)parent.add(new THREE.Mesh(merge(list),ghost?mats.ghost:glow));};
  if(type==='relay') {
    const legs=[[.17,.17],[-.17,.17],[.17,-.17],[-.17,-.17]],top=[.055,1.02];
    for(const [x,z] of legs){m.push(strut([x,0,z],[Math.sign(x)*top[0],top[1],Math.sign(z)*top[0]],.03,'#6f7c6f'));s.push(part(new THREE.BoxGeometry(.09,.06,.09),'#a3a192',{p:[x,.03,z]}));}
    for(const h of [.26,.55,.8]){const w=.17-(.17-.055)*h/1.02;for(const [a,b] of [[[w,h,w],[-w,h,w]],[[w,h,-w],[-w,h,-w]],[[w,h,w],[w,h,-w]],[[-w,h,w],[-w,h,-w]]])m.push(strut(a,b,.016,'#7a877a'));}
    for(const [h0,h1] of [[0,.26],[.26,.55],[.55,.8]]){const w0=.17-.115*h0/1.02,w1=.17-.115*h1/1.02;for(const sx of [1,-1]){m.push(strut([sx*w0,h0,w0],[-sx*w1,h1,w1],.012,'#7a877a'),strut([sx*w0,h0,-w0],[-sx*w1,h1,-w1],.012,'#7a877a'));}}
    m.push(part(new THREE.BoxGeometry(.64,.035,.04),'#5f6b60',{p:[0,1,0]}),part(new THREE.BoxGeometry(.2,.03,.03),'#5f6b60',{p:[0,1.07,0]}));
    for(const x of [.28,-.28])for(let i=0;i<3;i++)p.push(part(new THREE.CylinderGeometry(.03,.03,.016,10),'#d3e3cb',{p:[x,.975-i*.028,0]}));
    glowParts.push(part(new THREE.SphereGeometry(.032,10,8),'#ffffff',{p:[0,1.12,0]}));
    add(root,m,mats.metal);add(root,s,mats.stone);add(root,p,mats.paint);addGlow(root,glowParts);
    out.anchor.position.set(0,.93,0);out.anchors=[new THREE.Vector3(.28,.93,0),new THREE.Vector3(-.28,.93,0)];out.height=1.18;
  } else {
    s.push(...foundation(type==='frost'?'#a7b3b1':type==='arc'?'#96919f':type==='mortar'?'#a49a8b':'#a8a595'));
    const anchor=mast(m);out.anchor.position.copy(anchor);pips(glowParts,level,'#ffffff');
    const yaw=new THREE.Group(),ys=[],ym=[],yp=[],yg=[];
    if(type==='gun') {
      p.push(part(new THREE.CylinderGeometry(.2,.24,.1,14),'#6d7360',{p:[0,.2,0]}));
      yaw.position.y=.25;
      yp.push(part(new THREE.BoxGeometry(.36,.2,.32),'#c3b280',{p:[0,.1,0]}),part(new THREE.BoxGeometry(.08,.17,.27),'#a8996b',{p:[.2,.1,0]}),
        part(new THREE.CylinderGeometry(.07,.07,.03,12),'#8d8260',{p:[-.05,.215,0]}),part(new THREE.BoxGeometry(.12,.1,.08),'#6d6a4a',{p:[-.1,.08,-.2]}));
      if(level>=2)yp.push(part(new THREE.BoxGeometry(.3,.16,.03),'#b3a473',{p:[0,.1,.176]}),part(new THREE.BoxGeometry(.3,.16,.03),'#b3a473',{p:[0,.1,-.176]}));
      yg.push(part(new THREE.SphereGeometry(.03,10,8),'#ffffff',{p:[.12,.22,.09]}));
      if(level>=2)yg.push(part(new THREE.SphereGeometry(.024,8,6),'#ffffff',{p:[.12,.22,-.09]}));
      const recoil=new THREE.Group();recoil.position.set(.22,.11,0);yaw.add(recoil);
      if(level<3) {
        const barrels=[];for(const z of [.065,-.065])barrels.push(part(new THREE.CylinderGeometry(.027,.03,.42,10),'#3a4043',{p:[.21,0,z],r:[0,0,-Math.PI/2]}),part(new THREE.CylinderGeometry(.042,.042,.075,10),'#2b3033',{p:[.43,0,z],r:[0,0,-Math.PI/2]}));
        recoil.add(mesh(barrels,ghost?mats.ghost:mats.metal));
        for(const z of [.065,-.065]){const mz=new THREE.Object3D();mz.position.set(.48,0,z);recoil.add(mz);out.muzzles.push(mz);}
      } else {
        const spin=new THREE.Group();recoil.add(spin);const barrels=[];
        for(let i=0;i<6;i++){const a=i/6*TAU;barrels.push(part(new THREE.CylinderGeometry(.017,.017,.48,8),'#3a4043',{p:[.24,Math.cos(a)*.05,Math.sin(a)*.05],r:[0,0,-Math.PI/2]}));}
        barrels.push(part(new THREE.CylinderGeometry(.075,.075,.035,14),'#2b3033',{p:[.44,0,0],r:[0,0,-Math.PI/2]}),part(new THREE.CylinderGeometry(.07,.07,.04,14),'#2b3033',{p:[.1,0,0],r:[0,0,-Math.PI/2]}));
        spin.add(mesh(barrels,ghost?mats.ghost:mats.metal));out.spin=spin;
        const mz=new THREE.Object3D();mz.position.set(.5,0,0);recoil.add(mz);out.muzzles.push(mz);
      }
      out.recoil=recoil;out.height=.72;
    } else if(type==='mortar') {
      for(let i=0;i<9;i++){const a=i/9*TAU;s.push(part(new THREE.SphereGeometry(.09,8,6),i%2?'#a38d66':'#98835e',{p:[Math.cos(a)*.27,.19,Math.sin(a)*.27],r:[0,-a,0],s:[.55,.5,1.1]}));}
      for(let i=0;i<3;i++)m.push(part(new THREE.CylinderGeometry(.03,.03,.1,8),'#6b6f4f',{p:[-.12+i*.07,.2,-.3]}),part(new THREE.ConeGeometry(.03,.05,8),'#b39a58',{p:[-.12+i*.07,.275,-.3]}));
      yaw.position.y=.17;
      ym.push(part(new THREE.CylinderGeometry(.16,.18,.06,12),'#474b47',{p:[0,.03,0]}),part(new THREE.BoxGeometry(.14,.16,.035),'#51564f',{p:[0,.12,.1]}),part(new THREE.BoxGeometry(.14,.16,.035),'#51564f',{p:[0,.12,-.1]}));
      const pitch=new THREE.Group();pitch.position.set(0,.13,0);pitch.rotation.z=-.62;yaw.add(pitch);
      const recoil=new THREE.Group();pitch.add(recoil);
      const r0=level>=3?.1:.085,tube=[part(new THREE.CylinderGeometry(r0,r0*1.15,.46,16),'#b3693f',{p:[0,.2,0]}),part(new THREE.TorusGeometry(r0,.018,6,16),'#2f302d',{p:[0,.43,0],r:[Math.PI/2,0,0]}),part(new THREE.SphereGeometry(r0*1.18,12,10),'#3c3e3a',{p:[0,-.02,0]})];
      if(level>=2)tube.push(part(new THREE.TorusGeometry(r0*1.08,.014,6,16),'#3a3a36',{p:[0,.12,0],r:[Math.PI/2,0,0]}),part(new THREE.TorusGeometry(r0*1.05,.014,6,16),'#3a3a36',{p:[0,.3,0],r:[Math.PI/2,0,0]}));
      recoil.add(mesh(tube,ghost?mats.ghost:mats.paint));
      if(level>=3)for(const z of [.12,-.12])ym.push(part(new THREE.BoxGeometry(.09,.07,.09),'#6b5a3a',{p:[-.14,.05,z]}));
      yg.push(part(new THREE.BoxGeometry(.04,.03,.02),'#ffffff',{p:[.12,.07,.12]}));
      const mz=new THREE.Object3D();mz.position.set(0,.47,0);recoil.add(mz);out.muzzles.push(mz);out.recoil=recoil;out.height=.8;
    } else if(type==='frost') {
      p.push(part(new THREE.CylinderGeometry(.2,.25,.22,6),'#8ea7a9',{p:[0,.26,0]}));
      for(let i=0;i<3;i++){const a=i/3*TAU+.5;m.push(part(new THREE.CylinderGeometry(.05,.05,.3,12),'#cfdbdc',{p:[Math.cos(a)*.2,.3,Math.sin(a)*.2]}),part(new THREE.SphereGeometry(.05,10,6,0,TAU,0,Math.PI/2),'#cfdbdc',{p:[Math.cos(a)*.2,.45,Math.sin(a)*.2]}));glowParts.push(part(new THREE.TorusGeometry(.052,.01,4,14),'#ffffff',{p:[Math.cos(a)*.2,.3,Math.sin(a)*.2],r:[Math.PI/2,0,0]}));}
      glowParts.push(part(new THREE.TorusGeometry(.2,.012,6,32),'#ffffff',{p:[0,.5,0],r:[Math.PI/2,0,0]}));
      const crystalMat=ghost?mats.ghost:new THREE.MeshStandardMaterial({color:'#bfeeea',emissive:new THREE.Color(color),emissiveIntensity:.55,roughness:.08,metalness:.2,flatShading:true,transparent:true,opacity:.92});
      const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.15+level*.015,0),crystalMat);crystal.scale.set(1,1.75,1);crystal.position.y=.76;crystal.castShadow=!ghost;root.add(crystal);out.crystal=crystal;out.crystalMat=crystalMat;
      const orbit=new THREE.Group();orbit.position.y=.72;root.add(orbit);out.orbit=orbit;
      const shards=[3,4,6][level-1];
      for(let i=0;i<shards;i++){const a=i/shards*TAU,sh=new THREE.Mesh(new THREE.OctahedronGeometry(.038,0),crystalMat);sh.position.set(Math.cos(a)*.27,Math.sin(a*2)*.05,Math.sin(a)*.27);sh.scale.y=1.8;orbit.add(sh);}
      out.emitter.position.set(0,1.02,0);out.height=1.1;
    } else if(type==='arc') {
      p.push(part(new THREE.CylinderGeometry(.22,.26,.1,14),'#5d5a6b',{p:[0,.2,0]}));
      m.push(part(new THREE.CylinderGeometry(.06,.06,.22,10),'#7e7f85',{p:[0,.34,0]}));
      for(let i=0;i<4;i++)s.push(part(new THREE.CylinderGeometry(.12,.12,.024,18),'#ebe7da',{p:[0,.26+i*.045,0]}));
      m.push(part(new THREE.CylinderGeometry(.07,.07,.36,14),'#9a5d2e',{p:[0,.62,0]}));
      const helix=new THREE.CatmullRomCurve3(Array.from({length:72},(_,i)=>new THREE.Vector3(Math.cos(i*.62)*.078,.45+i*.0047,Math.sin(i*.62)*.078)));
      m.push(part(new THREE.TubeGeometry(helix,140,.009,5),'#d4904f'));
      const tr=level>=2?.18:.155;
      m.push(part(new THREE.TorusGeometry(tr,.05,12,28),'#c9ced6',{p:[0,.84,0],r:[Math.PI/2,0,0]}),part(new THREE.SphereGeometry(.055,12,10),'#d8dde4',{p:[0,.92,0]}));
      if(level>=3)m.push(part(new THREE.TorusGeometry(.11,.035,10,24),'#c9ced6',{p:[0,.99,0],r:[Math.PI/2,0,0]}));
      glowParts.push(part(new THREE.TorusGeometry(tr,.018,6,28),'#ffffff',{p:[0,.84,0],r:[Math.PI/2,0,0],s:[1.02,1.02,1.4]}));
      out.emitter.position.set(0,level>=3?1.04:.95,0);out.height=1.08;
    }
    add(yaw,ys,mats.stone);add(yaw,ym,mats.metal);add(yaw,yp,mats.paint);
    if(yg.length)addGlow(yaw,yg);
    if(yaw.children.length){root.add(yaw);out.yaw=yaw;}
    add(root,s,mats.stone);add(root,m,mats.metal);add(root,p,mats.paint);addGlow(root,glowParts);
  }
  root.add(out.anchor,out.emitter);
  out.dispose=()=>root.traverse(o=>{o.geometry?.dispose();if(o.material&&!Object.values(mats).includes(o.material))o.material.dispose();});
  return out;
}

// ————— Creatures (instanced) —————
// Bodies are baked per kind; legs are drawn with shared instanced segments posed by two-bone IK each frame.
export const CREATURES={
  crawler:{bodyY:.13,scale:1.35,legs:{hips:[[.09,.1],[0,.115],[-.09,.1]],upper:.15,lower:.17,reach:.2,stride:.22,lift:.06,radius:.02},eyes:[[.2,.15,.035],[.2,.15,-.035]],eye:'#ff5a3c',eyeSize:.022,hpY:.42,hpW:.34,leg:'#3f3a3a',
    body:()=>[part(new THREE.SphereGeometry(.16,14,10),'#9a4f47',{p:[0,.14,0],s:[1.25,.48,1]}),part(new THREE.SphereGeometry(.15,12,8),'#5a3b37',{p:[0,.1,0],s:[1.2,.35,.95]}),
      part(new THREE.BoxGeometry(.11,.07,.12),'#5b3a36',{p:[.19,.13,0]}),...[-.06,0,.06].map(x=>part(new THREE.BoxGeometry(.05,.025,.18),'#7b3c36',{p:[x,.205,0]})),
      part(new THREE.ConeGeometry(.018,.07,5),'#3a2c2a',{p:[.26,.1,.03],r:[0,0,-1.9]}),part(new THREE.ConeGeometry(.018,.07,5),'#3a2c2a',{p:[.26,.1,-.03],r:[0,0,-1.9]})]},
  runner:{bodyY:.17,scale:1.35,legs:{hips:[[.08,.08],[-.1,.08]],upper:.2,lower:.23,reach:.16,stride:.34,lift:.09,radius:.017},eyes:[[.25,.19,0]],eye:'#ffc34a',eyeSize:.03,eyeScale:[.6,.55,2.4],hpY:.46,hpW:.32,leg:'#40392e',
    body:()=>[part(new THREE.SphereGeometry(.14,14,10),'#c8954f',{p:[0,.18,0],s:[1.9,.5,.72]}),part(new THREE.SphereGeometry(.12,12,8),'#4a3c2c',{p:[0,.14,0],s:[1.7,.35,.6]}),
      part(new THREE.ConeGeometry(.06,.16,6),'#b88542',{p:[.3,.17,0],r:[0,0,-Math.PI/2]}),part(new THREE.BoxGeometry(.2,.02,.07),'#8c6630',{p:[-.3,.23,0],r:[0,0,.35]}),
      part(new THREE.BoxGeometry(.14,.05,.02),'#8c6630',{p:[-.05,.25,0]})]},
  tank:{bodyY:.2,scale:1.3,legs:{hips:[[.15,.19],[0,.21],[-.15,.19]],upper:.22,lower:.25,reach:.26,stride:.2,lift:.05,radius:.03},eyes:[[.27,.34,.07],[.27,.34,-.07]],eye:'#c99bff',eyeSize:.028,hpY:.66,hpW:.56,leg:'#403a48',
    claws:{arm:[.3,.16,.18],size:.13},
    body:()=>[part(new THREE.SphereGeometry(.3,18,12,0,TAU,0,Math.PI/2),'#8a7a9b',{p:[0,.17,0],s:[1.12,.62,1]}),part(new THREE.CylinderGeometry(.32,.3,.1,18),'#4d4556',{p:[0,.14,0],s:[1.12,1,1]}),
      part(new THREE.TorusGeometry(.31,.022,6,24),'#6c6178',{p:[0,.18,0],r:[Math.PI/2,0,0],s:[1.12,1,1]}),
      ...[[.05,.34,.1],[-.12,.32,-.08],[.13,.3,-.13],[-.02,.36,-.02],[-.18,.27,.12],[.16,.29,.15]].map(([x,y,z],i)=>part(new THREE.SphereGeometry(.035+i%3*.01,8,6),'#c9c1a7',{p:[x,y,z]})),
      part(new THREE.CylinderGeometry(.012,.014,.12,5),'#403a48',{p:[.27,.28,.07]}),part(new THREE.CylinderGeometry(.012,.014,.12,5),'#403a48',{p:[.27,.28,-.07]})]},
  splitter:{bodyY:.16,scale:1.35,legs:{hips:[[.08,.1],[-.08,.1]],upper:.14,lower:.16,reach:.16,stride:.18,lift:.05,radius:.019},eyes:[[.05,.3,.07],[-.07,.29,-.06],[.13,.22,-.1],[-.1,.2,.12]],eye:'#b8ff72',eyeSize:.05,hpY:.5,hpW:.36,leg:'#39413a',
    body:()=>[part(new THREE.SphereGeometry(.2,16,12),'#6f8f5a',{p:[0,.2,0],s:[1.1,.82,1]}),part(new THREE.SphereGeometry(.12,12,8),'#556e45',{p:[.16,.16,0],s:[1,.8,.9]}),
      ...[[.0,.38,.0],[-.12,.33,.1],[.08,.34,-.12]].map(([x,y,z])=>part(new THREE.ConeGeometry(.025,.08,5),'#3e4f34',{p:[x,y,z]}))]},
  spawn:{bodyY:.08,scale:1.4,legs:{hips:[[.04,.05],[-.04,.05]],upper:.08,lower:.09,reach:.09,stride:.12,lift:.04,radius:.011},eyes:[[.02,.15,0]],eye:'#d9ff8a',eyeSize:.03,hpY:.26,hpW:.2,leg:'#3c4436',
    body:()=>[part(new THREE.SphereGeometry(.09,12,8),'#8ea96d',{p:[0,.1,0],s:[1.15,.8,1]}),part(new THREE.SphereGeometry(.05,8,6),'#6a8250',{p:[.08,.08,0]})]},
  boss:{bodyY:.46,scale:1.15,legs:{hips:[[.34,.34],[.12,.4],[-.12,.4],[-.34,.34]],upper:.62,lower:.7,reach:.62,stride:.42,lift:.14,radius:.06},eyes:[[.72,.62,.1],[.72,.62,-.1],[.7,.7,.2],[.7,.7,-.2]],eye:'#ff6a3a',eyeSize:.045,hpY:1.55,hpW:1.2,leg:'#33231f',
    claws:{arm:[.62,.38,.46],size:.34},core:[0,.62,0,.26],
    body:()=>[part(new THREE.SphereGeometry(.55,24,16),'#5b3b36',{p:[0,.6,0],s:[1.3,.58,1]}),part(new THREE.SphereGeometry(.5,20,12),'#3a2622',{p:[0,.46,0],s:[1.25,.42,.95]}),
      ...[-.36,-.12,.12,.36].map(x=>part(new THREE.BoxGeometry(.2,.1,.72),'#7a4a40',{p:[x,.9,0],r:[0,0,x*.3]})),
      part(new THREE.BoxGeometry(.34,.26,.5),'#4a302b',{p:[.66,.6,0]}),
      ...[[-.3,1.02,.2],[-.05,1.06,-.22],[.2,1.02,.24],[-.45,.95,-.25],[.35,.97,-.1],[0,1.08,.02]].map(([x,y,z])=>part(new THREE.ConeGeometry(.06,.26,6),'#2e1e1b',{p:[x,y,z],r:[z*.8,0,-x*.5]})),
      part(new THREE.CylinderGeometry(.04,.02,.6,6),'#2e1e1b',{p:[-.72,.7,.2],r:[.4,0,1.2]}),part(new THREE.CylinderGeometry(.04,.02,.6,6),'#2e1e1b',{p:[-.72,.7,-.2],r:[-.4,0,1.2]})]}
};
export function clawGeometry() {
  return {arm:merge([part(new THREE.BoxGeometry(.5,.16,.16),'#5d4f68',{p:[.25,0,0]}),part(new THREE.SphereGeometry(.13,10,8),'#4d4356',{p:[.52,0,0]}),part(new THREE.BoxGeometry(.42,.09,.16),'#7a6a8a',{p:[.8,-.05,0],r:[0,0,.12]})]),
    jaw:merge([part(new THREE.BoxGeometry(.42,.09,.15),'#8a7a9b',{p:[.21,0,0],r:[0,0,-.1]}),part(new THREE.ConeGeometry(.05,.14,6),'#c9c1a7',{p:[.44,-.03,0],r:[0,0,-Math.PI/2-.4]})])};
}

// ————— Scenery —————
export function treeGeometries() {
  const pine=merge([part(new THREE.CylinderGeometry(.035,.05,.4,6),'#5b4632',{p:[0,.2,0]}),part(new THREE.ConeGeometry(.3,.46,8),'#2f5a3e',{p:[0,.48,0]}),part(new THREE.ConeGeometry(.24,.4,8),'#376646',{p:[0,.72,0]}),part(new THREE.ConeGeometry(.16,.34,8),'#40714d',{p:[0,.94,0]})]);
  const broad=merge([part(new THREE.CylinderGeometry(.04,.06,.46,6),'#5e4a36',{p:[0,.23,0]}),part(new THREE.IcosahedronGeometry(.24,1),'#4f7a3d',{p:[0,.6,0],s:[1,.85,1]}),
    part(new THREE.IcosahedronGeometry(.18,1),'#5e8746',{p:[.14,.72,.06]}),part(new THREE.IcosahedronGeometry(.17,1),'#46703a',{p:[-.12,.68,-.08]}),part(new THREE.IcosahedronGeometry(.14,1),'#6a9150',{p:[0,.84,0]})]);
  return {pine,broad};
}
export function rockGeometry(seed) {
  const g=new THREE.IcosahedronGeometry(1,1),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),n=1+.28*Math.sin(x*3.1+seed)*Math.cos(z*2.7-seed)+.12*Math.sin(y*5.3+seed*2);pos.setXYZ(i,x*n,y*n*.62,z*n);}
  g.computeVertexNormals();return merge([part(g,'#8d887c')]);
}
export function grassGeometry() {
  const blades=[];
  for(let i=0;i<6;i++){
    const a=i/6*TAU+i*.4,lean=.25+(i%3)*.12,h=.13+(i%3)*.05,g=new THREE.BufferGeometry();
    const bx=Math.cos(a)*.02,bz=Math.sin(a)*.02,tx=Math.cos(a)*lean*h,tz=Math.sin(a)*lean*h,px=-Math.sin(a)*.012,pz=Math.cos(a)*.012;
    g.setAttribute('position',new THREE.Float32BufferAttribute([bx-px,0,bz-pz,bx+px,0,bz+pz,tx,h,tz],3));
    g.setAttribute('color',new THREE.Float32BufferAttribute([.2,.3,.13,.2,.3,.13,.55,.66,.32],3));g.computeVertexNormals();
    const n=g.attributes.normal;for(let k=0;k<3;k++)n.setXYZ(k,0,1,0);
    blades.push(g);
  }
  let count=0;for(const b of blades)count+=3;const pos=new Float32Array(count*3),nor=new Float32Array(count*3),col=new Float32Array(count*3);let o=0;
  for(const b of blades){pos.set(b.attributes.position.array,o*3);nor.set(b.attributes.normal.array,o*3);col.set(b.attributes.color.array,o*3);o+=3;b.dispose();}
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));out.setAttribute('color',new THREE.BufferAttribute(col,3));
  return out;
}
export function buildCottage(mats) {
  const group=new THREE.Group(),s=[],w=[],m=[],windows=[];
  s.push(part(new THREE.BoxGeometry(.9,.5,.62),'#d8d0bc',{p:[0,.25,0]}),part(new THREE.BoxGeometry(.94,.06,.66),'#9e9886',{p:[0,.03,0]}),part(new THREE.BoxGeometry(.16,.5,.16),'#9b8f7c',{p:[.28,.72,-.16]}));
  const roof=new THREE.CylinderGeometry(.01,.52,.36,4,1);roof.rotateY(Math.PI/4);
  w.push(part(roof,'#8e3f33',{p:[0,.68,0],s:[1.35,1,.95]}),part(new THREE.BoxGeometry(.14,.28,.02),'#5a4332',{p:[-.12,.14,.32]}));
  for(const [x,z,r] of [[.22,.315,0],[-.46,.05,Math.PI/2],[.46,-.1,Math.PI/2]])windows.push(part(new THREE.BoxGeometry(.13,.12,.02),'#ffffff',{p:[x,.3,z],r:[0,r,0]}));
  for(let i=0;i<8;i++)w.push(part(new THREE.BoxGeometry(.03,.16,.03),'#7a6248',{p:[-.55+i*.16,.08,.62]}));
  w.push(part(new THREE.BoxGeometry(1.15,.02,.02),'#7a6248',{p:[.01,.13,.62]}));
  m.push(part(new THREE.CylinderGeometry(.012,.015,.6,6),'#2c3430',{p:[.6,.3,.5]}));
  group.add(mesh(s,mats.stone),mesh(w,mats.wood),mesh(m,mats.metal));
  const windowMat=new THREE.MeshStandardMaterial({vertexColors:true,color:'#2a2822',emissive:new THREE.Color('#ffc46e'),emissiveIntensity:0,roughness:.4});
  group.add(new THREE.Mesh(merge(windows),windowMat));
  const lampMat=new THREE.MeshStandardMaterial({color:'#fff0c8',emissive:new THREE.Color('#ffc86e'),emissiveIntensity:0});
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),lampMat);lamp.position.set(.6,.62,.5);group.add(lamp);
  const chimney=new THREE.Vector3(.28,1,-.16);
  return {group,windowMat,lampMat,chimney};
}
export function buildPier(mats,length) {
  const w=[];
  w.push(part(new THREE.BoxGeometry(length,.05,.5),'#8a6d4c',{p:[length/2,0,0]}));
  for(let i=0;i<=Math.floor(length/.45);i++)w.push(part(new THREE.BoxGeometry(.03,.052,.5),i%2?'#735a3e':'#7e6445',{p:[i*.45+.05,.003,0]}));
  for(let x=.2;x<length;x+=.7)for(const z of [.22,-.22])w.push(part(new THREE.CylinderGeometry(.035,.04,1.6,6),'#4f3d2b',{p:[x,-.75,z]}));
  w.push(part(new THREE.BoxGeometry(.2,.18,.2),'#7d6a4a',{p:[length-.4,.12,.12]}),part(new THREE.CylinderGeometry(.08,.08,.2,10),'#5d6b64',{p:[length-.72,.12,-.14]}));
  return mesh(w,mats.wood);
}
export function buildBoat(mats) {
  const hull=new THREE.LatheGeometry([[0,-.12],[.12,-.1],[.2,-.02],[.22,.06]].map(([x,y])=>new THREE.Vector2(x,y)),12);
  const g=[part(hull,'#e8e1cf',{s:[3,1,1.15]}),part(new THREE.BoxGeometry(.9,.03,.3),'#8a6d4c',{p:[0,.03,0]}),part(new THREE.TorusGeometry(.22,.02,4,12,Math.PI),'#b44e3b',{p:[0,.06,0],r:[Math.PI/2,0,0],s:[3,1.15,1]}),
    part(new THREE.CylinderGeometry(.015,.015,.8,5),'#6a5a48',{p:[.05,.42,0]}),part(new THREE.BoxGeometry(.24,.2,.24),'#6d7d74',{p:[-.2,.13,0]})];
  return mesh(g,mats.paint);
}
export function buildBuoy(color) {
  const g=merge([part(new THREE.CylinderGeometry(.09,.13,.18,10),color,{p:[0,.02,0]}),part(new THREE.ConeGeometry(.08,.28,8),color,{p:[0,.24,0]}),part(new THREE.CylinderGeometry(.14,.14,.04,12),'#2d3432',{p:[0,-.04,0]})]);
  return g;
}
export function birdGeometry() {
  const body=merge([part(new THREE.SphereGeometry(.05,8,6),'#e9ece6',{s:[2.2,.8,.8]}),part(new THREE.ConeGeometry(.018,.05,5),'#e0a23c',{p:[.13,0,0],r:[0,0,-Math.PI/2]})]);
  const wing=new THREE.BufferGeometry();
  wing.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.08,0,.02,-.03,0,.3, .08,0,.02,.02,0,.28,-.03,0,.3],3));
  wing.setAttribute('color',new THREE.Float32BufferAttribute([.92,.93,.9,.92,.93,.9,.35,.37,.38, .92,.93,.9,.4,.42,.43,.35,.37,.38],3));wing.computeVertexNormals();
  return {body,wing};
}
