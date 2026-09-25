import * as THREE from '../../vendor/three.module.min.js';

const VERTEX=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const BRIGHT=`uniform sampler2D tMap;uniform float uThreshold;varying vec2 vUv;
void main(){vec3 c=texture2D(tMap,vUv).rgb;float l=max(c.r,max(c.g,c.b)),knee=uThreshold*.5,soft=clamp(l-uThreshold+knee,0.,2.*knee);soft=soft*soft/(4.*knee+1e-4);
gl_FragColor=vec4(c*max(soft,l-uThreshold)/max(l,1e-4),1.);}`;
const DOWN=`uniform sampler2D tMap;uniform vec2 uTexel;varying vec2 vUv;
void main(){vec2 o=uTexel*.5;vec3 c=texture2D(tMap,vUv).rgb*4.+texture2D(tMap,vUv-o).rgb+texture2D(tMap,vUv+o).rgb+texture2D(tMap,vUv+vec2(o.x,-o.y)).rgb+texture2D(tMap,vUv-vec2(o.x,-o.y)).rgb;gl_FragColor=vec4(c/8.,1.);}`;
const UP=`uniform sampler2D tMap;uniform vec2 uTexel;uniform float uRadius;varying vec2 vUv;
void main(){vec2 o=uTexel*uRadius;vec3 c=texture2D(tMap,vUv+vec2(-o.x*2.,0.)).rgb+texture2D(tMap,vUv+vec2(-o.x,o.y)).rgb*2.+texture2D(tMap,vUv+vec2(0.,o.y*2.)).rgb+texture2D(tMap,vUv+o).rgb*2.
+texture2D(tMap,vUv+vec2(o.x*2.,0.)).rgb+texture2D(tMap,vUv+vec2(o.x,-o.y)).rgb*2.+texture2D(tMap,vUv+vec2(0.,-o.y*2.)).rgb+texture2D(tMap,vUv-o).rgb*2.;gl_FragColor=vec4(c/12.,1.);}`;
const COMPOSITE=`uniform sampler2D tScene,tBloom;uniform float uStrength,uVignette;varying vec2 vUv;
void main(){vec3 c=texture2D(tScene,vUv).rgb+texture2D(tBloom,vUv).rgb*uStrength;
float v=smoothstep(.92,.28,length((vUv-.5)*vec2(1.12,1.)));c*=mix(1.,v,uVignette);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// HDR scene → soft-knee bright pass → dual-filter mip chain → composite with tone mapping.
export class Bloom {
  constructor(renderer,{strength=.72,threshold=.9,levels=5}={}) {
    this.renderer=renderer;this.levels=levels;
    const opts={type:THREE.HalfFloatType,depthBuffer:false};
    this.scene=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
    this.mips=Array.from({length:levels},()=>new THREE.WebGLRenderTarget(1,1,opts));
    this.ups=Array.from({length:levels-1},()=>new THREE.WebGLRenderTarget(1,1,opts));
    const mat=(fragmentShader,uniforms)=>new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader,uniforms,depthTest:false,depthWrite:false});
    this.bright=mat(BRIGHT,{tMap:{value:null},uThreshold:{value:threshold}});
    this.down=mat(DOWN,{tMap:{value:null},uTexel:{value:new THREE.Vector2()}});
    this.up=mat(UP,{tMap:{value:null},uTexel:{value:new THREE.Vector2()},uRadius:{value:1}});
    this.add=mat(UP,{tMap:{value:null},uTexel:{value:new THREE.Vector2()},uRadius:{value:1}});
    this.composite=mat(COMPOSITE,{tScene:{value:null},tBloom:{value:null},uStrength:{value:strength},uVignette:{value:.32}});
    this.up.blending=THREE.AdditiveBlending;this.up.transparent=true;
    for(const m of [this.bright,this.down,this.up,this.add])m.toneMapped=false;
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.bright);this.quad.frustumCulled=false;
    this.post=new THREE.Scene();this.post.add(this.quad);this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  }
  setSize(width,height) {
    this.scene.setSize(width,height);
    let w=Math.max(1,width>>1),h=Math.max(1,height>>1);
    for(let i=0;i<this.levels;i++){this.mips[i].setSize(w,h);if(i<this.levels-1)this.ups[i].setSize(w,h);w=Math.max(1,w>>1);h=Math.max(1,h>>1);}
  }
  pass(material,target) {this.quad.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.post,this.camera);}
  render(scene,camera,strength) {
    const r=this.renderer;
    r.setRenderTarget(this.scene);r.render(scene,camera);
    this.bright.uniforms.tMap.value=this.scene.texture;this.pass(this.bright,this.mips[0]);
    for(let i=1;i<this.levels;i++){const src=this.mips[i-1];this.down.uniforms.tMap.value=src.texture;this.down.uniforms.uTexel.value.set(1/src.width,1/src.height);this.pass(this.down,this.mips[i]);}
    // Walk back up: each level blurs the smaller one and adds its own detail.
    let src=this.mips[this.levels-1];
    for(let i=this.levels-2;i>=0;i--){
      const dst=this.ups[i];
      this.add.uniforms.tMap.value=this.mips[i].texture;this.add.uniforms.uTexel.value.set(1/this.mips[i].width,1/this.mips[i].height);this.pass(this.add,dst);
      this.up.uniforms.tMap.value=src.texture;this.up.uniforms.uTexel.value.set(1/src.width,1/src.height);
      const auto=r.autoClear;r.autoClear=false;this.pass(this.up,dst);r.autoClear=auto;
      src=dst;
    }
    this.composite.uniforms.tScene.value=this.scene.texture;this.composite.uniforms.tBloom.value=src.texture;this.composite.uniforms.uStrength.value=strength;
    this.pass(this.composite,null);
  }
  dispose() {
    for(const t of [this.scene,...this.mips,...this.ups])t.dispose();
    for(const m of [this.bright,this.down,this.up,this.add,this.composite])m.dispose();this.quad.geometry.dispose();
  }
}
