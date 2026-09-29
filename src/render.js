import {PADS,PATH,SOURCE,TYPES,ENEMIES,STRIKE,BEAM,DARK,PATH_LENGTH,towerStats,dist,pathPosition,isNightWave} from './game.js';
import {t} from './i18n.js';

const TAU=Math.PI*2;
const rnd=(x,y=0)=>{const a=Math.sin(x*127.1+y*311.7)*43758.5453;return a-Math.floor(a);};
const land=(x,y)=>x>=0&&y>=0&&x<=13&&y<=11&&((x-6.5)/7.25)**2+((y-5.5)/6.25)**2<1;
const pathCells=new Set();
for(let i=1;i<PATH.length;i++) {
  const [ax,ay]=PATH[i-1],[bx,by]=PATH[i];
  for(let j=0;j<=Math.abs(bx-ax)+Math.abs(by-ay);j++)pathCells.add(`${ax+Math.sign(bx-ax)*j},${ay+Math.sign(by-ay)*j}`);
}
const onPath=(x,y)=>pathCells.has(`${x},${y}`);
const COLORS={grass:['#788f69','#81966e','#7c9268','#869a73','#748c66','#889c72'],path:['#c7b18b','#c4ad84','#cfb991','#cbb68c']};

export class Renderer {
  constructor(canvas,game,{insets=null}={}) {
    this.kind='2d';this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.game=game;this.aim=null;this.highlight=null;
    this.time=0;this.hover=null;this.selected=null;this.buildType=null;this.grid=true;this.particles=[];this.shake=0;this.dark=0;this.rings=[];
    this.insets={top:0,right:0,bottom:0,left:0,...insets};
    this.cache=document.createElement('canvas');this.shade=document.createElement('canvas');this.clouds=[];
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);
    // Fit the island into the open space between the HUD bars.
    const i=this.insets,w=Math.max(120,this.w-i.left-i.right),h=Math.max(120,this.h-i.top-i.bottom);
    this.s=Math.min(w/24.5,h/15.4);
    this.ox=i.left+w*.5;this.oy=i.top+h*.5;
    this.cache.width=this.shade.width=this.canvas.width;this.cache.height=this.shade.height=this.canvas.height;
    this.cacheCtx=this.cache.getContext('2d');this.cacheCtx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const original=this.ctx;this.ctx=this.cacheCtx;this.drawTerrain();this.ctx=original;
    this.canvas.dispatchEvent(new CustomEvent('mapresize'));
  }
  setInsets(insets){this.insets={...this.insets,...insets};this.resize();}
  p(x,y,z=0){return {x:this.ox+(x-6.5-y+5.5)*this.s,y:this.oy+((x-6.5)+(y-5.5))*this.s*.52-z*this.s,behind:false};}
  // Inverse of the isometric projection on the ground plane.
  pickGround(px,py){const u=(px-this.ox)/this.s,v=(py-this.oy+.3*this.s)/(this.s*.52);return {x:(u+v+13)/2,y:(v-u+11)/2};}
  consumeClick(){return false;}
  setGame(game){this.game=game;this.particles=[];this.shake=0;this.aim=null;}
  dispose(){this.observer.disconnect();}
  onEvent(e) {
    if(e.type==='kill')this.burst(e.x,e.y,e.color,e.enemyType==='boss'?28:8);
    if(e.type==='build'||e.type==='upgrade')this.burst(e.tower.x,e.tower.y,TYPES[e.tower.type].color,18);
    if(e.type==='split')this.burst(e.x,e.y,'#b8ff72',10);
    if(e.type==='strikeHit'){this.burst(e.x,e.y,'#ffe2a0',30);this.shake=1;}
    if(e.type==='leak')this.shake=1;
    if(e.type==='beam')this.rings.push({x:e.x,y:e.y,t:0});
  }
  // Iso ellipse for a circle of radius r (tiles) on the ground.
  groundEllipse(x,y,r,z=.32){const p=this.p(x,y,z);return {x:p.x,y:p.y,rx:r*this.s*Math.SQRT2,ry:r*this.s*.52*Math.SQRT2};}
  poly(points,fill,stroke,width=1) {
    const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
    if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
  }
  line(points,color,width=1,dash=[]) {
    const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);
  }
  circle(p,r,color,stroke) {const c=this.ctx;c.beginPath();c.arc(p.x,p.y,r,0,TAU);if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
  ellipse(p,rx,ry,fill,stroke,width=1) {const c=this.ctx;c.beginPath();c.ellipse(p.x,p.y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
  box(x,y,z,w,d,h,top,left,right) {
    const a=this.p(x-w/2,y-d/2,z+h),b=this.p(x+w/2,y-d/2,z+h),c=this.p(x+w/2,y+d/2,z+h),e=this.p(x-w/2,y+d/2,z+h);
    this.poly([e,c,this.p(x+w/2,y+d/2,z),this.p(x-w/2,y+d/2,z)],left);
    this.poly([b,c,this.p(x+w/2,y+d/2,z),this.p(x+w/2,y-d/2,z)],right);
    this.poly([a,b,c,e],top);
  }
  cylinder(x,y,z,r,h,top,front,side,sides=8) {
    const angles=Array.from({length:sides},(_,i)=>TAU*i/sides);
    for(let i=0;i<sides;i++) {
      const a=angles[i],b=angles[(i+1)%sides],mid=(a+b)/2;
      if(i!==sides-1&&Math.sin(mid)+Math.cos(mid)<0)continue;
      const x1=x+Math.cos(a)*r,y1=y+Math.sin(a)*r,x2=x+Math.cos(b)*r,y2=y+Math.sin(b)*r;
      this.poly([this.p(x1,y1,z),this.p(x2,y2,z),this.p(x2,y2,z+h),this.p(x1,y1,z+h)],Math.sin(mid)>Math.cos(mid)?front:side);
    }
    this.poly(angles.map(a=>this.p(x+Math.cos(a)*r,y+Math.sin(a)*r,z+h)),top);
  }
  drawTerrain() {
    const c=this.ctx;c.clearRect(0,0,this.w,this.h);
    const center=this.p(6.5,5.5,-1.1);
    this.ellipse({...center,y:center.y+this.s},this.s*9.7,this.s*4.65,'#0a313c55');
    const tiles=[];
    for(let x=0;x<14;x++)for(let y=0;y<12;y++)if(land(x,y))tiles.push({x,y});
    tiles.sort((a,b)=>a.x+a.y-b.x-b.y);
    for(const {x,y} of tiles) {
      const z=.14,depth=1.15+rnd(x,y)*.42;
      const corners=[this.p(x-.5,y-.5,z),this.p(x+.5,y-.5,z),this.p(x+.5,y+.5,z),this.p(x-.5,y+.5,z)];
      if(!land(x+1,y)) {
        this.poly([corners[1],corners[2],this.p(x+.5,y+.5,-depth),this.p(x+.5,y-.5,-depth)],'#4a5b58');
        this.poly([corners[1],corners[2],this.p(x+.5,y+.5,-.12),this.p(x+.5,y-.5,-.12)],'#849075');
        this.line([this.p(x+.5,y-.5,-depth),this.p(x+.5,y+.5,-depth)],'#82bec047',this.s*.14);
      }
      if(!land(x,y+1)) {
        this.poly([corners[2],corners[3],this.p(x-.5,y+.5,-depth),this.p(x+.5,y+.5,-depth)],'#596b60');
        this.poly([corners[2],corners[3],this.p(x-.5,y+.5,-.12),this.p(x+.5,y+.5,-.12)],'#95a07c');
        this.line([this.p(x-.5,y+.5,-depth),this.p(x+.5,y+.5,-depth)],'#b4d5c454',this.s*.14);
      }
      const color=(onPath(x,y)?COLORS.path:COLORS.grass)[Math.floor(rnd(x,y)* (onPath(x,y)?4:6))];
      this.poly(corners,color,color,.6);
      if(onPath(x,y)) {
        for(let j=0;j<3;j++){const a=x+(rnd(x+j*4,y)-.5)*.8,b=y+(rnd(y+j*4,x)-.5)*.8;this.ellipse(this.p(a,b,.15),this.s*.045,this.s*.021,'#ab987768');}
      }else {
        for(let j=0;j<3;j++) {
          const a=x+(rnd(x+j*8,y)-.5)*.8,b=y+(rnd(y+j*8,x)-.5)*.8,p=this.p(a,b,.16);
          this.line([p,{x:p.x+2,y:p.y-3}],rnd(x+j,y)>.5?'#adbd8470':'#496b5355',.8);
        }
      }
    }
    // Stone stairs lead out of the water to the invasion route.
    for(let i=0;i<5;i++)this.box(-.7-i*.25,4,.02-i*.19,.32,.78,.17,'#9aa193','#6e7c73','#5a6d68');
    // Flat footprints stay below every dynamic object.
    for(const pad of PADS) {
      this.cylinder(pad.x,pad.y,.16,.48,.1,'#929f83','#6d7c6c','#5c7064');
      this.cylinder(pad.x,pad.y,.26,.37,.03,'#738475','#607264','#546958');
    }
  }
  tree(x,y,size=1) {
    const s=this.s,p=this.p(x,y,.2),h=s*size;
    this.ellipse({x:p.x+6,y:p.y+2},h*.40,h*.12,'#253e3433');
    this.line([p,{x:p.x,y:p.y-h*.62}],'#6f7054',Math.max(2,s*.08));
    for(let j=0;j<3;j++) {
      const yy=p.y-h*(.24+j*.21),w=h*(.36-j*.07);
      this.poly([{x:p.x-w,y:yy},{x:p.x,y:yy-h*.46},{x:p.x+w,y:yy},{x:p.x,y:yy+h*.12}],['#4b745c','#547d60','#638769'][j]);
      this.poly([{x:p.x,y:yy-h*.46},{x:p.x+w,y:yy},{x:p.x,y:yy+h*.12}],['#365c4f','#406957','#50755d'][j]);
    }
  }
  rock(x,y,size=.5) {
    const p=this.p(x,y,.2),s=this.s*size;
    this.poly([{x:p.x-s,y:p.y},{x:p.x-s*.6,y:p.y-s*.6},{x:p.x+s*.28,y:p.y-s*.8},{x:p.x+s,y:p.y-s*.25},{x:p.x+s*.6,y:p.y+s*.3},{x:p.x-s*.45,y:p.y+s*.35}],'#9ba58e');
    this.poly([{x:p.x+s*.28,y:p.y-s*.8},{x:p.x+s,y:p.y-s*.25},{x:p.x+s*.6,y:p.y+s*.3},{x:p.x,y:p.y}],'#647c70');
  }
  drawLighthouse() {
    const {x,y}=SOURCE,s=this.s;
    this.cylinder(x,y,.2,.78,.25,'#bbb59b','#8c907d','#6f8071');
    this.cylinder(x,y,.45,.48,.28,'#d9d1b4','#b7b59c','#9ca38d');
    this.cylinder(x,y,.73,.37,1.4,'#e2dbc1','#d1c7aa','#a9b09b');
    this.cylinder(x,y,1.12,.385,.3,'#be8770','#ba7a63','#956958');
    this.cylinder(x,y,2.13,.45,.14,'#e2d8b9','#b8b29a','#909d8a');
    this.cylinder(x,y,2.27,.33,.58,'#f2d398','#e2b86c','#cca76c');
    for(let i=0;i<6;i++){const a=TAU*i/6;this.line([this.p(x+Math.cos(a)*.33,y+Math.sin(a)*.33,2.27),this.p(x+Math.cos(a)*.33,y+Math.sin(a)*.33,2.85)],'#384e4a',s*.05);}
    this.cylinder(x,y,2.85,.5,.12,'#637b70','#48665b','#36574e');
    const center=this.p(x,y,3.4),corners=Array.from({length:6},(_,i)=>this.p(x+Math.cos(TAU*i/6)*.48,y+Math.sin(TAU*i/6)*.48,2.97));
    for(let i=0;i<6;i++)this.poly([center,corners[i],corners[(i+1)%6]],['#6a8877','#546d65','#3d5c55','#526b62','#75917a','#819781'][i]);
    this.line([center,this.p(x,y,3.67)],'#384f46',2);
    const light=this.p(x,y,2.57),c=this.ctx;
    const glow=c.createRadialGradient(light.x,light.y,1,light.x,light.y,s*1.55);
    glow.addColorStop(0,'#ffe6a284');glow.addColorStop(.35,'#f8cd6520');glow.addColorStop(1,'#f7c46400');
    this.circle(light,s*1.55,glow);this.circle(light,s*.085,'#fff1be');
    const spot=this.game.canEdit()?this.game.beam.spot:null;
    c.save();c.globalCompositeOperation='screen';
    if(spot&&this.game.beam.charge>.2){
      // Lowered beam: a wedge from the lamp that widens into the pool of light.
      const e=this.groundEllipse(spot.x,spot.y,BEAM.radius),a=Math.atan2(e.y-light.y,e.x-light.x),n={x:-Math.sin(a),y:Math.cos(a)},w=e.rx*.8;
      const beam=c.createLinearGradient(light.x,light.y,e.x,e.y);beam.addColorStop(0,'#ffe6b066');beam.addColorStop(1,'#ffe6b014');
      this.poly([light,{x:e.x+n.x*w,y:e.y+n.y*w*.6},{x:e.x-n.x*w,y:e.y-n.y*w*.6}],beam);
    } else {
      const angle=this.time*.17,beam=c.createRadialGradient(light.x,light.y,s*.1,light.x,light.y,s*6);
      beam.addColorStop(0,'#ffdda32d');beam.addColorStop(1,'#ffdda300');
      this.poly([light,{x:light.x+Math.cos(angle-.1)*s*7,y:light.y+Math.sin(angle-.1)*s*3},{x:light.x+Math.cos(angle+.1)*s*7,y:light.y+Math.sin(angle+.1)*s*3}],beam);
    }
    c.restore();
    // Small door and entry path ground the landmark in the island.
    this.box(x-.05,y+.35,.5,.16,.035,.31,'#55665a','#536254','#536254');
    for(let i=0;i<3;i++)this.box(x-.05,y+.52+i*.16,.2,.36,.17,.08+(2-i)*.05,'#b5b49b','#939b84','#818f79');
  }
  drawTower(t,ghost=false) {
    const c=this.ctx,s=this.s,z=.3,p=this.p(t.x,t.y,z),color=TYPES[t.type].color;
    c.save();if(ghost)c.globalAlpha=.55;
    this.ellipse({...p,y:p.y+s*.12},s*.52,s*.22,'#263c3838');
    this.cylinder(t.x,t.y,z,.34,.18,'#bab9a1','#8e9a87','#748c7d');
    this.cylinder(t.x,t.y,z+.18,.27,.18,'#455e58','#3f5851','#324d48');
    if(t.type==='gun') {
      this.box(t.x,t.y,z+.36,.38,.4,.30,'#d6cdae','#b1b299','#8d9e8b');
      const start=this.p(t.x,t.y,z+.59),end=this.p(t.x+Math.cos(t.angle)*.53,t.y+Math.sin(t.angle)*.53,z+.59);
      this.line([start,end],'#334c46',s*.14);this.circle(end,s*.077,'#7f9881');
      this.box(t.x-.12,t.y-.1,z+.67,.08,.2,.09,'#edca86','#c5a973','#a68d60');
    } else if(t.type==='mortar') {
      this.cylinder(t.x,t.y,z+.34,.28,.17,'#b17d67','#8c6c5c','#705d51');
      this.cylinder(t.x,t.y,z+.49,.2,.27,'#e0af88','#c28b6c','#9b715e');
      this.ellipse(this.p(t.x,t.y,z+.76),s*.16,s*.083,'#354d48','#d2a685',2);
    } else if(t.type==='frost') {
      this.cylinder(t.x,t.y,z+.36,.19,.38,'#779d99','#638c89','#527a78');
      const top=this.p(t.x,t.y,z+1.03),mid=this.p(t.x,t.y,z+.72),bottom=this.p(t.x,t.y,z+.50);
      this.poly([top,{x:mid.x+s*.2,y:mid.y},bottom,mid],'#bce4d8');
      this.poly([top,mid,bottom,{x:mid.x-s*.2,y:mid.y}],'#7db8b3');
      if(t.powered||ghost)this.ellipse(mid,s*.32,s*.12,null,'#b4dedb88');
    } else if(t.type==='arc') {
      this.cylinder(t.x,t.y,z+.36,.12,.1,'#ebe7da','#cfc9b8','#b3ad9c');
      this.cylinder(t.x,t.y,z+.46,.07,.34,'#c98a4f','#a86a36','#8a5429');
      this.ellipse(this.p(t.x,t.y,z+.84),s*.2,s*.085,'#c9ced6','#8f95a0',1.5);
      this.circle(this.p(t.x,t.y,z+.9),s*.05,t.powered||ghost?'#e3dcff':'#8a8a95');
    } else {
      if(t.powered&&this.dark>.05&&!ghost){const lamp=this.p(t.x,t.y,z+.9),g=c.createRadialGradient(lamp.x,lamp.y,0,lamp.x,lamp.y,s*.5);g.addColorStop(0,`rgba(255,214,150,${.7*this.dark})`);g.addColorStop(1,'rgba(255,214,150,0)');this.circle(lamp,s*.5,g);}
      this.box(t.x,t.y,z+.85,.66,.13,.10,'#ccd8af','#a9bd94','#879f7d');
      this.circle(this.p(t.x,t.y,z+1.08),s*.075,t.connected?'#e9f6b0':'#737e68');
      for(const d of [-.24,.24])this.line([this.p(t.x+d,t.y,z+.95),this.p(t.x+d,t.y,z+1.10)],'#465f4a',2);
    }
    if(!ghost) {
      const pin=this.p(t.x,t.y,.37);this.circle({x:pin.x,y:pin.y+s*.12},s*.047,t.powered?color:'#e98f76');
      for(let i=0;i<t.level;i++)this.circle({x:pin.x+(i-(t.level-1)/2)*s*.1,y:pin.y+s*.25},s*.026,color);
      if(!t.powered) {const p=this.p(t.x,t.y,1.43);this.circle(p,8,'#c98064');c.fillStyle='#fff4d9';c.font='bold 10px sans-serif';c.textAlign='center';c.fillText('!',p.x,p.y+3);}
    }
    c.restore();
  }
  drawEnemy(e) {
    const s=this.s,p=this.p(e.x,e.y,.34),boss=e.type==='boss',scale=boss?2.2:e.type==='tank'?1.35:e.type==='runner'?.7:e.type==='splitter'?1.12:e.type==='spawn'?.55:1;
    this.ellipse({...p,y:p.y+s*.1},s*.3*scale,s*.13*scale,'#233b3e45');
    const color=e.hit>0?'#ffe5bf':e.slow>0?'#8fb9b9':e.color;
    for(let i=0;i<3;i++) {
      const bounce=Math.sin(this.time*15+i*2+e.id)*s*.035;
      for(const sign of [-1,1])this.line([{x:p.x+sign*s*.11*scale,y:p.y+s*.04*(i-1)*scale},{x:p.x+sign*s*.28*scale,y:p.y+s*.14*(i-1)*scale+bounce},{x:p.x+sign*s*.34*scale,y:p.y+s*.17*(i-1)*scale+bounce+s*.08}],'#555652',Math.max(1.5,s*.044*scale));
    }
    this.cylinder(e.x,e.y,.35,.22*scale,.18*scale,color,'#8c665f','#6e5b58',6);
    const b=this.p(e.x,e.y,.35+.18*scale);
    this.line([{x:b.x-s*.1*scale,y:b.y},{x:b.x+s*.1*scale,y:b.y}],boss?'#fae0a1':'#e7c197',s*.044);
    if(boss)for(const sign of [-1,1])this.poly([{x:p.x+sign*s*.21,y:p.y-s*.3},{x:p.x+sign*s*.42,y:p.y-s*.76},{x:p.x+sign*s*.5,y:p.y-s*.24}],'#dfb489');
    if(e.hp<e.maxHp||boss) {
      const width=s*.6*scale,hp=this.p(e.x,e.y,.85*scale);this.line([{x:hp.x-width/2,y:hp.y},{x:hp.x+width/2,y:hp.y}],'#223e3b',3);
      this.line([{x:hp.x-width/2,y:hp.y},{x:hp.x-width/2+width*Math.max(0,e.hp/e.maxHp),y:hp.y}],boss?'#edb57f':'#d2d8a5',3);
    }
  }
  range(x,y,r,color) {
    const points=Array.from({length:65},(_,i)=>this.p(x+Math.cos(i/64*TAU)*r,y+Math.sin(i/64*TAU)*r,.32));
    this.poly(points,color+'0b',color+'80',1);this.line(points,color+'66',1,[4,5]);
  }
  hitPad(px,py) {
    let best=null,bestDistance=Infinity;
    for(const pad of PADS){const p=this.p(pad.x,pad.y,.3),d=Math.hypot((p.x-px),(p.y-py)*1.65);if(d<this.s*.7&&d<bestDistance){best=pad;bestDistance=d;}}
    return best;
  }
  burst(x,y,color,count=12) {
    for(let i=0;i<count;i++)this.particles.push({x,y,z:.5,vx:(rnd(i+this.time,x)-.5)*2,vy:(rnd(i+this.time,y+1)-.5)*2,vz:1+rnd(i,this.time)*2,life:.45+rnd(i,this.time)*.5,color});
  }
  draw(dt,realDt=dt) {
    const c=this.ctx,s=this.s,g=this.game;
    this.time+=dt;if(!s)return;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    const bg=c.createLinearGradient(0,0,this.w,this.h);bg.addColorStop(0,'#254850');bg.addColorStop(.45,'#315b5d');bg.addColorStop(1,'#254c51');
    c.fillStyle=bg;c.fillRect(0,0,this.w,this.h);
    // Slow, broken ocean contours keep the scene alive without competing with play.
    for(let i=0;i<70;i++) {
      const x=rnd(i,11)*this.w,y=rnd(i,20)*this.h,a=.04+Math.sin(this.time*.6+i)*.025;
      this.line([{x:x+Math.sin(this.time*.2+i)*5,y},{x:x+16+rnd(i,9)*35,y:y-2}],`rgba(201,223,205,${a})`,1);
    }
    c.save();
    if(this.shake>0){this.shake=Math.max(0,this.shake-dt*3);c.translate(Math.sin(this.time*90)*this.shake*4,Math.cos(this.time*110)*this.shake*2);}
    c.drawImage(this.cache,0,0,this.w,this.h);
    // Power network is drawn on the terrain, under the buildings.
    if(this.grid||this.buildType)for(const edge of g.network) {
      const a=this.p(edge.from.x,edge.from.y,.36),b=this.p(edge.to.x,edge.to.y,.36);
      this.line([a,b],'#3c635680',4);this.line([a,b],edge.to.powered?'#d3df9ca6':'#dc987b88',1.3);
      if(edge.to.powered){const t=(this.time*.23+edge.to.id*.14)%1;this.circle({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},1.8,'#e6ecba');}
    }
    if(g.phase==='build'&&(g.endless||g.wave<10)) {
      const next=g.waveDef(g.wave+1),color=next.units.some(([type])=>type==='boss')?'255,146,116':isNightWave(g.wave+1)?'168,189,255':'246,217,154';
      for(let i=0;i<30;i++){
        const d=(i*PATH_LENGTH/30+this.time*.9)%PATH_LENGTH,a=pathPosition(d),b=pathPosition(Math.min(PATH_LENGTH,d+.2)),pa=this.p(a.x,a.y,.18),pb=this.p(b.x,b.y,.18);
        const k=Math.atan2(pb.y-pa.y,pb.x-pa.x),alpha=Math.min(1,d/1.2,(PATH_LENGTH-d)/1.4)*(.35+.5*Math.max(0,Math.sin(d*.8-this.time*2.4)));
        const r=s*.16,tip={x:pa.x+Math.cos(k)*r,y:pa.y+Math.sin(k)*r};
        this.line([{x:pa.x+Math.cos(k+2.5)*r,y:pa.y+Math.sin(k+2.5)*r},tip,{x:pa.x+Math.cos(k-2.5)*r,y:pa.y+Math.sin(k-2.5)*r}],`rgba(${color},${alpha})`,2);
      }
    }
    for(const pad of PADS) {
      const t=g.towers.find(t=>t.pad===pad.id),p=this.p(pad.x,pad.y,.32),active=this.hover===pad.id||this.selected===pad.id;
      if(!t&&this.highlight===pad.id){const k=.5+.5*Math.sin(this.time*4);this.ellipse(p,s*(.46+.08*k),s*(.23+.04*k),`rgba(245,215,149,${.18+.2*k})`,'#f5d795',2);}
      if(!t||active) {
        this.ellipse(p,s*.38,s*.19,null,active?'#f1d697':this.buildType?'#d1d8afa0':'#b7c1a260',active?1.8:1);
        if(!t){this.line([{x:p.x-3,y:p.y},{x:p.x+3,y:p.y}],active?'#f5dea5':'#becbb0',1);this.line([{x:p.x,y:p.y-3},{x:p.x,y:p.y+3}],active?'#f5dea5':'#becbb0',1);}
      }
    }
    const target=PADS[this.hover??this.selected],chosen=target&&g.towers.find(t=>t.pad===target.id);
    if(target&&(chosen||this.buildType)) {
      const def=chosen?towerStats(chosen):TYPES[this.buildType],r=chosen?.type==='relay'||this.buildType==='relay'&&!chosen?4.8:def.range;
      if(r)this.range(target.x,target.y,r,def.color);
      if(this.buildType&&!chosen){const parent=[{...SOURCE,type:'source'},...g.towers.filter(t=>t.connected)].find(t=>dist(t,target)<=Math.max(t.type==='source'?SOURCE.radius:t.type==='relay'?4.8:3,this.buildType==='relay'?4.8:3));if(parent)this.line([this.p(parent.x,parent.y,.4),this.p(target.x,target.y,.4)],'#e7e9b4',1,[4,4]);}
    }
    if(target&&chosen&&chosen.type!=='relay'&&(g.isNight()||g.phase==='build'&&isNightWave(g.wave+1))){
      const r=towerStats(chosen).range*DARK.sight,pts=Array.from({length:49},(_,i)=>this.p(target.x+Math.cos(i/48*TAU)*r,target.y+Math.sin(i/48*TAU)*r,.32));this.line(pts,'#dfe6ffb0',1.2,[3,5]);
    }
    const spot=g.canEdit()?g.beam.spot:null,glow=spot?Math.min(1,g.beam.charge):0;
    if(glow>0){
      const e=this.groundEllipse(spot.x,spot.y,BEAM.radius);c.save();c.globalCompositeOperation='screen';
      const pool=c.createRadialGradient(e.x,e.y,0,e.x,e.y,e.rx);pool.addColorStop(0,`rgba(255,232,180,${.5*glow})`);pool.addColorStop(.7,`rgba(255,226,160,${.22*glow})`);pool.addColorStop(1,'rgba(255,226,160,0)');
      c.translate(e.x,e.y);c.scale(1,e.ry/e.rx);c.translate(-e.x,-e.y);this.circle({x:e.x,y:e.y},e.rx,pool);c.restore();
      this.ellipse(e,e.rx,e.ry,null,`rgba(255,230,176,${.35*glow})`,1);
    }
    const scenery=[];
    for(let x=0;x<14;x++)for(let y=0;y<12;y++) {
      if(!land(x,y)||onPath(x,y)||PADS.some(p=>dist(p,{x,y})<.85)||dist(SOURCE,{x,y})<1.3)continue;
      if(rnd(x,y+60)>.57)scenery.push({depth:x+y,draw:()=>this.tree(x+(rnd(x,1)-.5)*.25,y,.62+rnd(x,y)*.52)});
      else if(rnd(x,y+20)>.7)scenery.push({depth:x+y,draw:()=>this.rock(x,y,.25+rnd(x,y)*.30)});
    }
    scenery.push({depth:SOURCE.x+SOURCE.y,draw:()=>this.drawLighthouse()});
    for(const t of g.towers)scenery.push({depth:t.x+t.y+.05,draw:()=>this.drawTower(t)});
    for(const e of g.enemies)scenery.push({depth:e.x+e.y+.15,draw:()=>this.drawEnemy(e)});
    if(this.buildType&&target&&!chosen)scenery.push({depth:target.x+target.y+.06,draw:()=>this.drawTower({...target,type:this.buildType,angle:-Math.PI/2},true)});
    scenery.sort((a,b)=>a.depth-b.depth);for(const item of scenery)item.draw();
    for(const p of g.projectiles) {
      const t=p.age/p.duration,a=this.p(p.fromX,p.fromY,.92),enemy=g.enemies.find(e=>e.id===p.target),b=this.p(p.kind==='mortar'?p.toX:enemy?.x??p.toX,p.kind==='mortar'?p.toY:enemy?.y??p.toY,.55);
      const point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-(p.kind==='mortar'?Math.sin(t*Math.PI)*s*2:0)};
      if(p.kind==='arc'){const pts=[a,...(p.points||[]).map(q=>this.p(q.x,q.y,.55))];for(let i=1;i<pts.length;i++){const m={x:(pts[i-1].x+pts[i].x)/2+(rnd(i,this.time*40)-.5)*10,y:(pts[i-1].y+pts[i].y)/2+(rnd(this.time*40,i)-.5)*10};this.line([pts[i-1],m,pts[i]],'#d9ceffdd',2);}continue;}
      if(p.kind==='frost')this.line([a,point],'#bbefe8bb',2);
      else this.line([{x:point.x-(b.x-a.x)*.08,y:point.y-(b.y-a.y)*.08},point],'#ffdc9fab',2);
      this.circle(point,p.kind==='mortar'?3:2,p.kind==='frost'?'#d4fff2':'#ffedbd');
    }
    for(const fx of g.effects)if(fx.kind==='blast') {
      const p=this.p(fx.x,fx.y,.5),t=1-fx.life/fx.total;c.globalAlpha=1-t;
      this.ellipse(p,s*(.2+t*1.5),s*(.1+t*.7),'#f2be7833','#f3d5a6',2);c.globalAlpha=1;
    } else if(fx.kind==='strike') {
      const p=this.p(fx.x,fx.y,.3),t=1-fx.life/fx.total;c.globalAlpha=1-t;
      this.poly([{x:p.x-s*.25,y:p.y-s*8},{x:p.x+s*.25,y:p.y-s*8},{x:p.x+s*.12,y:p.y},{x:p.x-s*.12,y:p.y}],'#ffe7b066');
      this.ellipse(p,s*STRIKE.radius*(.6+t*.8),s*STRIKE.radius*.52*(.6+t*.8),'#ffe2a033','#fff0c8',2.5);c.globalAlpha=1;
    }
    for(const strike of g.strikes||[]){const p=this.p(strike.x,strike.y,.3),k=1-strike.delay/STRIKE.delay;this.ellipse(p,s*STRIKE.radius*(1-k*.5),s*STRIKE.radius*.52*(1-k*.5),null,'#ffe2a0',1+2*k);}
    if(this.aim){const r=STRIKE.radius,pts=Array.from({length:49},(_,i)=>this.p(this.aim.x+Math.cos(i/48*TAU)*r,this.aim.y+Math.sin(i/48*TAU)*r,.32));this.poly(pts,'#ffe7a31a','#ffe7a3',1.5);}
    this.dark+=((g.isNight()?.58:0)-this.dark)*Math.min(1,realDt*2);
    if(this.dark>.01){
      const x=this.shade.getContext('2d');x.setTransform(this.dpr,0,0,this.dpr,0,0);x.globalCompositeOperation='source-over';x.clearRect(0,0,this.w,this.h);
      x.fillStyle=`rgba(6,12,30,${this.dark})`;x.fillRect(0,0,this.w,this.h);x.globalCompositeOperation='destination-out';
      const hole=(e,strength=1)=>{x.save();x.translate(e.x,e.y);x.scale(1,e.ry/e.rx);const grad=x.createRadialGradient(0,0,0,0,0,e.rx);grad.addColorStop(0,`rgba(0,0,0,${strength})`);grad.addColorStop(.65,`rgba(0,0,0,${strength*.8})`);grad.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=grad;x.beginPath();x.arc(0,0,e.rx,0,TAU);x.fill();x.restore();};
      if(glow>0)hole(this.groundEllipse(spot.x,spot.y,BEAM.radius*1.15),glow);
      hole(this.groundEllipse(SOURCE.x,SOURCE.y,DARK.glow*1.1),.9);
      for(const t of g.towers)if(t.type==='relay'&&t.powered)hole(this.groundEllipse(t.x,t.y,DARK.lamp*1.1),.85);
      c.drawImage(this.shade,0,0,this.w,this.h);
      // Eyes still glint in the dark.
      for(const e of g.enemies)if(!e.seen){const p=this.p(e.x,e.y,.62);this.circle({x:p.x-2,y:p.y},1.3,'#ffcf8a');this.circle({x:p.x+2,y:p.y},1.3,'#ffcf8a');}
    }
    for(const r of this.rings){r.t+=dt;const k=Math.min(1,r.t/.55),e=this.groundEllipse(r.x,r.y,BEAM.radius*(.3+.7*k));this.ellipse(e,e.rx,e.ry,null,`rgba(255,230,176,${1-k})`,2);}
    this.rings=this.rings.filter(r=>r.t<.55);
    if(!g.paused)for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=6*dt;}
    this.particles=this.particles.filter(p=>p.life>0);
    for(const part of this.particles){c.globalAlpha=Math.min(1,part.life*2);this.circle(this.p(part.x,part.y,Math.max(.2,part.z)),2,part.color);}c.globalAlpha=1;
    // Entrance chevrons and a restrained geographic annotation.
    const entrance=this.p(-.3,4,.4);c.fillStyle='#f0c699';c.font=`500 ${Math.max(9,s*.28)}px monospace`;c.textAlign='right';c.fillText(t('map.entrance'),entrance.x-15,entrance.y-12);
    for(let i=0;i<3;i++){const p=this.p(-.5+i*.3,4,.4);this.line([{x:p.x-4,y:p.y-4},{x:p.x,y:p.y},{x:p.x-5,y:p.y+1}],'#f1c99b90',1.4);}
    c.restore();
    // Distant seabirds, deliberately outside the playable center.
    for(let i=0;i<4;i++) {const x=(this.time*8+i*67)%(this.w+120)-60,y=this.h*.12+i*11+Math.sin(this.time*.6+i)*8;const wing=3+Math.sin(this.time*4+i)*2;this.line([{x:x-6,y:y-wing},{x,y},{x:x+6,y:y-wing}],'#c6d5bf66',1);}
  }
}

export function drawTowerIcon(canvas,type) {
  const r=Object.create(Renderer.prototype);r.canvas=canvas;r.ctx=canvas.getContext('2d');r.s=30;r.ox=40;r.oy=56;r.time=0;
  r.p=(x,y,z=0)=>({x:40+(x-y)*30,y:54+(x+y)*15-z*30});
  canvas.width=160;canvas.height=144;r.ctx.scale(2,2);
  r.drawTower({x:0,y:0,type,angle:-Math.PI/4,powered:true,connected:true,level:1});
}
