import * as THREE from '../vendor/three.module.min.js';
import {beamMaterial} from '../src/3d/models.js';

// Exercise the production fragment shader on a real half-float framebuffer.
// Slightly out-of-range varyings reproduce raster interpolation at the beam's rim.
const cases=[
  {along:-.000001,name:'before the lamp',dark:true},
  {along:0,name:'at the lamp',dark:true},
  {along:.5,name:'inside the beam',dark:false},
  {along:.999999,name:'just inside the rim'},
  {along:1,name:'at the rim',dark:true},
  {along:1+2**-23,name:'one float32 step past the rim',dark:true},
  {along:1.0001,name:'past the rim',dark:true}
];
const results=[];
let renderer,target,material,geometry;
try {
  renderer=new THREE.WebGLRenderer({canvas:document.getElementById('gpu'),antialias:false});
  renderer.setSize(8,8,false);renderer.setClearColor(0,0);
  target=new THREE.WebGLRenderTarget(8,8,{type:THREE.HalfFloatType,depthBuffer:false});
  material=beamMaterial();material.toneMapped=false;
  material.uniforms.uAlong={value:0};
  material.vertexShader=`uniform float uAlong;varying float vAlong;varying vec3 vN,vView,vWorld;
void main(){vAlong=uAlong;vN=vec3(1.,0.,0.);vView=vec3(1.,0.,0.);vWorld=vec3(.3,.4,.5);gl_Position=vec4(position.xy,0.,1.);}`;
  geometry=new THREE.PlaneGeometry(2,2);
  const scene=new THREE.Scene(),quad=new THREE.Mesh(geometry,material);
  quad.frustumCulled=false;scene.add(quad);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  for(const {along,name,dark} of cases) {
    material.uniforms.uAlong.value=along;
    renderer.setRenderTarget(target);renderer.render(scene,camera);
    const pixels=new Uint16Array(8*8*4);
    renderer.readRenderTargetPixels(target,0,0,8,8,pixels);
    const finite=pixels.every(value=>(value&0x7c00)!==0x7c00);
    const rgb=pixels.filter((_,i)=>i%4!==3),lit=rgb.some(value=>(value&0x7fff)!==0);
    // Also require the interior to emit light: disabling the beam must not pass.
    const passed=finite&&(dark===undefined||lit===!dark)&&pixels[3]===0x3c00;
    results.push({name,along,passed,finite,lit,pixel:Array.from(pixels.slice(0,4))});
  }
} catch(error) {
  results.push({name:'WebGL setup',passed:false,error:String(error)});
} finally {
  geometry?.dispose();material?.dispose();target?.dispose();renderer?.dispose();
}
const failed=results.filter(result=>!result.passed).length;
window.renderingTests={passed:results.length-failed,failed,results};
document.getElementById('results').textContent=JSON.stringify(window.renderingTests,null,2);
document.title=`${failed?'FAIL':'PASS'} · Last Beacon WebGL regression tests`;
