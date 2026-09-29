import {Game,PADS,TYPES,ENEMIES,TARGETING,STRIKE,BEAM,DARK,DIFFICULTIES,PATH_LENGTH,canStrikeAt,towerStats,upgradeCost,sellValue,waveDefinition,isNightWave,pathPosition} from './game.js';
import {Renderer,drawTowerIcon} from './render.js';
import {World3D,renderTowerIcons} from './3d/world.js';
import {AudioEngine} from './audio.js';
import {getLanguage,setLanguage,preferredLanguage,saveLanguage,t,towerName} from './i18n.js';

let storage;
try { storage=localStorage; } catch {}
const read=key=>{try{return storage?.getItem(key)??null;}catch{return null;}};
const write=(key,value)=>{try{storage?.setItem(key,value);}catch{}};
setLanguage(preferredLanguage(storage,navigator.languages?.length?navigator.languages:[navigator.language]));

const $=id=>document.getElementById(id);
const QUALITIES=['high','medium','low','classic'],BUILD_KEYS=['gun','mortar','frost','relay','arc'];
function supportsWebGL2(){try{const gl=document.createElement('canvas').getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl;}catch{return false;}}
const webgl=supportsWebGL2();
let quality=QUALITIES.includes(read('last-beacon-quality'))?read('last-beacon-quality'):!webgl?'classic':matchMedia('(pointer: coarse)').matches||Math.min(screen.width,screen.height)<720?'medium':'high';
if(new URLSearchParams(location.search).get('view')==='2d'||!webgl)quality='classic';
let difficulty=Object.hasOwn(DIFFICULTIES,read('last-beacon-difficulty'))?read('last-beacon-difficulty'):'normal',pendingDifficulty=difficulty;

const audio=new AudioEngine();
let canvas=$('battlefield'),game=new Game({difficulty}),renderer=null,buildType=null,selectedPad=null,hoverPad=null,gridOn=true,aiming=false;
let previous=performance.now(),lastHud=0,lastLog='',lastMenu='',toastTimer,bannerTimer,pauseBeforeDialog=false,bossShown=null,shownCredits=game.credits;
const records=Object.fromEntries(Object.keys(DIFFICULTIES).map(d=>[d,{wave:0,won:false,endless:0}]));
try{
  const stored=JSON.parse(read('last-beacon-best')||'null');
  // Earlier versions stored a single {wave,won} record for the only (normal) difficulty.
  const legacy=stored&&Number.isInteger(stored.wave)?{normal:stored}:stored||{};
  for(const d of Object.keys(records)){const r=legacy[d];if(r&&Number.isInteger(r.wave)&&r.wave>=0&&r.wave<=10)records[d]={wave:r.wave,won:r.won===true,endless:Number.isInteger(r.endless)&&r.endless>10?r.endless:0};}
}catch{}
const cards=[...document.querySelectorAll('.build-card[data-type]')];

let activeToast=null,activeBanner=null;
function paintToast(){
  if(activeToast)$('toast').textContent=t(activeToast.key,typeof activeToast.params==='function'?activeToast.params():activeToast.params);
}
function toast(key,params={}){
  activeToast={key,params};paintToast();$('toast').classList.add('visible');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{activeToast=null;$('toast').classList.remove('visible');},3300);
}
// Clear the message only once the fade-out has finished, so a slow frame never shows an empty box.
$('toast').addEventListener('transitionend',()=>{if(!activeToast)$('toast').textContent='';});
function paintBanner(){
  if(!activeBanner)return;
  $('wave-banner').innerHTML=`<small>${t(activeBanner.kicker,activeBanner.params)}</small><strong>${t(activeBanner.title,activeBanner.params)}</strong>`;
  $('wave-banner').classList.toggle('night',!!activeBanner.night);
}
function banner(title,kicker,params={},night=false){
  activeBanner={title,kicker,params,night};paintBanner();$('wave-banner').classList.add('show');clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>{activeBanner=null;$('wave-banner').classList.remove('show');$('wave-banner').textContent='';},2900);
}
function updateSoundButton(){
  const label=t(audio.enabled?'control.soundOff':'control.soundOn');
  $('sound').querySelector('.mute-slash').hidden=audio.enabled;
  $('sound').setAttribute('aria-label',label);$('sound').title=label+' [M]';
}
function updateQualityButton(){
  $('quality-value').textContent=t(`quality.${quality}`);
  $('camera-reset').hidden=renderer?.kind!=='3d';
}
function applyLanguage(){
  document.documentElement.lang=getLanguage()==='zh'?'zh-CN':'en';
  for(const element of document.querySelectorAll('[data-i18n]'))element.innerHTML=t(element.dataset.i18n);
  for(const [attribute,key] of [['aria-label','i18nAria'],['title','i18nTitle'],['content','i18nContent']]){
    const selector={'i18nAria':'data-i18n-aria','i18nTitle':'data-i18n-title','i18nContent':'data-i18n-content'}[key];
    for(const element of document.querySelectorAll(`[${selector}]`))element.setAttribute(attribute,t(element.dataset[key]));
  }
  $('language-toggle').dataset.language=getLanguage();
  $('language-toggle').setAttribute('aria-label',t('language.switch'));
  $('language-toggle').title=t('language.switch');
  for(const option of ringOptions)option.querySelector('span').textContent=towerName(option.dataset.type);
  updateSoundButton();updateQualityButton();paintDifficulty();lastLog='';lastMenu='';coachKey='';updateHud();paintToast();paintBanner();
  if(['won','lost'].includes(game.phase))renderResult();
  requestAnimationFrame(()=>updateInsets(true));
}
$('language-toggle').addEventListener('click',()=>{
  setLanguage(getLanguage()==='zh'?'en':'zh');saveLanguage(storage);applyLanguage();
});
function record(){return records[game.difficulty];}
function persistBest(){
  const r=record();
  r.wave=Math.max(r.wave,Math.min(game.wave,10));r.won=r.won||game.phase==='won'||game.endless;
  if(game.endless)r.endless=Math.max(r.endless,game.wave);
  write('last-beacon-best',JSON.stringify(records));
}

// ————— Renderer —————
const local=event=>{const r=canvas.getBoundingClientRect();return [event.clientX-r.left,event.clientY-r.top];};
const groundAt=event=>renderer.pickGround(...local(event));
const onMap=point=>point&&canStrikeAt(point.x,point.y)?point:null;
function bindCanvas(){
  canvas.addEventListener('mapresize',()=>{positionPads();positionOverlays();});
  canvas.addEventListener('pointermove',event=>{
    const [x,y]=local(event);
    if(aiming){renderer.aim=onMap(renderer.pickGround(x,y));canvas.style.cursor='crosshair';hoverPad=null;renderer.hover=null;return;}
    if(renderer.kind==='3d'&&event.buttons)return;
    const pad=renderer.hitPad(x,y);hoverPad=pad?.id??null;renderer.hover=hoverPad;
    canvas.style.cursor=pad?'pointer':'';
  });
  canvas.addEventListener('pointerleave',()=>{hoverPad=null;renderer.hover=null;if(aiming)renderer.aim=null;});
  canvas.addEventListener('click',event=>{
    if(renderer.consumeClick())return;
    const [x,y]=local(event);closeSystemMenu();
    if(aiming){fireStrikeAt(renderer.pickGround(x,y));return;}
    const pad=renderer.hitPad(x,y);
    if(pad){activatePad(pad.id);return;}
    // The first click on open ground only dismisses whatever is open; otherwise it points the beam there.
    if(buildType||selectedPad!==null){buildType=null;renderer.buildType=null;closeMenus();updateHud();return;}
    aimBeamAt(renderer.pickGround(x,y));
  });
}
function freshCanvas(){const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;bindCanvas();return next;}
function createRenderer(){
  const view=renderer?.rig?.snapshot();
  renderer?.dispose?.();renderer=null;
  if(quality!=='classic'){
    try{renderer=new World3D(freshCanvas(),game,{quality,view,insets});renderer.onSound=(kind,options)=>audio.play(kind,options);}
    catch(error){console.warn('3D view unavailable, using 2D.',error);quality='classic';toast('toast.webglFallback');}
  }
  if(!renderer)renderer=new Renderer(freshCanvas(),game,{insets});
  Object.assign(renderer,{hover:hoverPad,selected:selectedPad,buildType,grid:gridOn,aim:null,highlight:null});
  document.querySelector('.game-shell').classList.toggle('three-d',renderer.kind==='3d');
  padPositions.length=0;positionPads();updateQualityButton();
}
function drawIcons(){
  const icons=[...document.querySelectorAll('.build-card [data-icon]')];
  let drawn=false;
  if(quality!=='classic'){try{renderTowerIcons(icons);drawn=true;}catch(error){console.warn(error);}}
  if(!drawn)for(const icon of icons)drawTowerIcon(icon,icon.dataset.icon);
  // The build ring reuses the same pictures.
  for(const option of ringOptions){const icon=icons.find(i=>i.dataset.icon===option.dataset.type);try{option.querySelector('img').src=icon.toDataURL();}catch{}}
}
// The HUD covers the top and bottom of the screen; the island is framed inside the space between them.
let insets={top:0,right:0,bottom:0,left:0};
// Small HUD changes (an extra line of enemy names) are ignored so the island does not jump between waves.
function updateInsets(force=false){
  const w=innerWidth,h=innerHeight,top=Math.max(...[...document.querySelectorAll('.wave-card,.resources')].map(e=>e.getBoundingClientRect().bottom));
  const bottom=h-Math.min(...[...document.querySelectorAll('.build-bar,.actions')].map(e=>e.getBoundingClientRect().top));
  const next={top:Math.round(Math.min(h*.35,top+6)),bottom:Math.round(Math.min(h*.4,bottom+6)),left:Math.round(Math.min(w*.1,16)),right:Math.round(Math.min(w*.1,16))};
  if(!Object.keys(next).some(k=>Math.abs(next[k]-insets[k])>=(force?1:24)))return;
  insets=next;renderer?.setInsets?.(insets);
}
new ResizeObserver(()=>updateInsets()).observe(document.querySelector('.hud-top'));
new ResizeObserver(()=>updateInsets()).observe(document.querySelector('.hud-bottom'));
addEventListener('resize',()=>updateInsets(true));

function reset(){
  pauseBeforeDialog=false;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  game=new Game({difficulty});renderer.setGame(game);buildType=null;hoverPad=null;cancelAim();closeMenus();shownCredits=game.credits;
  renderer.hover=null;renderer.buildType=null;
  clearTimeout(toastTimer);clearTimeout(bannerTimer);$('toast').classList.remove('visible');$('wave-banner').classList.remove('show');
  activeToast=null;activeBanner=null;$('toast').textContent='';$('wave-banner').textContent='';
  $('speed').textContent='1×';$('paused-label').hidden=true;lastLog='';updateHud();
  if(difficulty==='normal')toast('toast.reset');else toast('toast.difficulty',()=>({level:t(`difficulty.${difficulty}`)}));
}
function selectType(type){
  if(!game.canEdit()){toast('toast.ended');return;}
  // With the build ring open on an empty pad, a number key builds right there.
  if(selectedPad!==null&&!towerAt(selectedPad)){buildAt(type,selectedPad);return;}
  cancelAim();closeMenus();buildType=buildType===type?null:type;renderer.buildType=buildType;updateHud();
}
const towerAt=id=>game.towers.find(t=>t.pad===id);
function activatePad(id,keyboard=false){
  closeSystemMenu();
  if(towerAt(id)){buildType=null;renderer.buildType=null;openMenu(id,keyboard);return;}
  if(buildType){buildAt(buildType,id);return;}
  openMenu(id,keyboard);
}
function buildAt(type,id){
  const result=game.build(type,id);
  if(!result.ok){toast(result.code);return;}
  buildType=null;renderer.buildType=null;closeMenus();
  if(!result.tower.connected)toast('toast.disconnected');
  else if(!result.tower.powered)toast('toast.overload');
  else toast('toast.connected',()=>({name:towerName(result.tower.type)}));
  updateHud();
}
const padButtons=PADS.map(p=>{
  const button=document.createElement('button');button.type='button';button.className='pad-control';button.dataset.pad=p.id;button.title=t('pad.title',{number:String(p.id+1).padStart(2,'0')});
  // While aiming a strike a pad is just a spot on the map: a pointer click aims where it lands, keyboard activation aims at the pad.
  button.addEventListener('click',event=>{if(aiming){fireStrikeAt(event.detail?groundAt(event):p);return;}activatePad(p.id,!event.detail);});
  button.addEventListener('pointermove',event=>{if(aiming)renderer.aim=onMap(groundAt(event));});
  const focus=()=>{if(aiming){renderer.aim=p;return;}hoverPad=p.id;renderer.hover=p.id;};
  button.addEventListener('pointerenter',focus);button.addEventListener('focus',focus);
  button.addEventListener('pointerleave',()=>{hoverPad=null;renderer.hover=null;});
  button.addEventListener('blur',()=>{hoverPad=null;renderer.hover=null;});
  $('pad-controls').append(button);return button;
});
const padPositions=[];
function positionPads(){
  if(!renderer)return;
  PADS.forEach((pad,i)=>{
    const p=renderer.p(pad.x,pad.y,.32),last=padPositions[i];
    if(last&&Math.abs(last.x-p.x)<.5&&Math.abs(last.y-p.y)<.5)return;
    padPositions[i]={x:p.x,y:p.y};padButtons[i].style.left=p.x+'px';padButtons[i].style.top=p.y+'px';
  });
}
cards.forEach(card=>card.addEventListener('click',()=>selectType(card.dataset.type)));

// ————— In-world menus: a ring of options on an empty pad, a card above a structure —————
const ring=$('build-ring'),towerMenu=$('tower-menu');
const ringCenter=document.createElement('button');ringCenter.type='button';ringCenter.className='ring-center';ringCenter.textContent='×';
ringCenter.addEventListener('click',()=>{closeMenus();updateHud();});
ring.append(ringCenter);
const ringOptions=BUILD_KEYS.map((type,i)=>{
  const option=document.createElement('button');option.type='button';option.className='ring-option';option.dataset.type=type;option.setAttribute('role','menuitem');
  option.innerHTML=`<kbd>${i+1}</kbd><img alt=""><span>${towerName(type)}</span><small>◇ ${TYPES[type].cost}</small>`;
  option.addEventListener('click',()=>{if(selectedPad!==null)buildAt(type,selectedPad);});
  const preview=on=>{renderer.buildType=on?type:buildType;renderer.hover=on?selectedPad:hoverPad;};
  option.addEventListener('pointerenter',()=>preview(true));option.addEventListener('pointerleave',()=>preview(false));
  option.addEventListener('focus',()=>preview(true));option.addEventListener('blur',()=>preview(false));
  ring.append(option);return option;
});
function openMenu(id,keyboard=false){
  cancelAim();selectedPad=id;renderer.selected=id;lastMenu='';
  if(!towerAt(id)){ring.hidden=false;ring.classList.remove('open');requestAnimationFrame(()=>ring.classList.add('open'));}
  updateHud();positionOverlays();
  // Keyboard users continue inside the menu; pointer users keep the preview free until they hover an option.
  if(keyboard)(towerAt(id)?towerMenu.querySelector('.upgrade,.sell'):ringOptions.find(o=>!o.disabled))?.focus({preventScroll:true});
}
function closeMenus(){
  // Keyboard focus inside a closing menu returns to its pad, so the next Enter reopens it.
  const pad=selectedPad,inside=ring.contains(document.activeElement)||towerMenu.contains(document.activeElement);
  selectedPad=null;if(renderer){renderer.selected=null;renderer.buildType=buildType;renderer.hover=hoverPad;}
  ring.hidden=true;ring.classList.remove('open');towerMenu.hidden=true;lastMenu='';
  if(inside&&pad!==null)padButtons[pad].focus({preventScroll:true});
}
function renderMenus(){
  const tower=selectedPad!==null?towerAt(selectedPad):null;
  if(selectedPad===null){ring.hidden=true;towerMenu.hidden=true;return;}
  if(!tower){
    towerMenu.hidden=true;ring.hidden=false;
    for(const option of ringOptions){const cost=TYPES[option.dataset.type].cost;option.disabled=!game.canEdit();option.classList.toggle('poor',game.credits<cost);}
    return;
  }
  ring.hidden=true;towerMenu.hidden=false;
  const def=towerStats(tower),relay=tower.type==='relay',canUpgrade=!relay&&tower.level<3,up=upgradeCost(tower);
  // Rebuild only when something shown changes, so hover and keyboard focus survive the frequent HUD refresh.
  const key=JSON.stringify([getLanguage(),tower.id,tower.level,tower.connected,tower.powered,tower.target,game.credits>=up,game.phase,game.isNight()]);
  if(key===lastMenu)return;lastMenu=key;
  const next=canUpgrade?towerStats({...tower,level:tower.level+1}):null,delta=(a,b,f=x=>x)=>next?`<em>+${f(b-a)}</em>`:'';
  const stat=(label,value,extra='')=>`<div><span>${t(label)}</span><strong>${value}</strong>${extra}</div>`;
  const stats=relay?[stat('stat.link','4.8'),stat('stat.lamp',DARK.lamp.toFixed(1)),stat('stat.power',0)]
    :[stat('stat.damage',Math.round(def.damage),delta(def.damage,next?.damage,Math.round)),stat('stat.range',def.range.toFixed(1),delta(def.range,next?.range,v=>v.toFixed(2))),def.chain?stat('stat.chain',def.chain,delta(def.chain,next?.chain)):stat('stat.power',def.power,delta(def.power,next?.power))];
  const focused=towerMenu.contains(document.activeElement)?document.activeElement:null;
  const refocus=focused&&(focused.dataset.target?`[data-target="${focused.dataset.target}"]`:focused.classList.contains('upgrade')?'.upgrade':focused.classList.contains('sell')?'.sell':'.tm-close');
  towerMenu.innerHTML=`<div class="tm-head"><h3>${towerName(tower.type)}</h3><span class="tm-level">LV ${tower.level} / ${relay?1:3}</span><button class="tm-close" type="button" aria-label="${t('ring.close')}">×</button></div>
    <span class="tm-status ${tower.powered?'':'offline'}">● ${t(tower.powered?'tower.powered':tower.connected?'tower.overload':'tower.disconnected')}</span>
    <div class="tm-stats">${stats.join('')}</div>
    ${relay?`<p class="tm-note">${t('tower.relayLamp',{radius:DARK.lamp})}</p>`:`<div class="tm-target"><span>${t('target.label')}</span><div role="group" aria-label="${t('target.label')}">${TARGETING.map(mode=>`<button type="button" data-target="${mode}" class="${tower.target===mode?'active':''}" aria-pressed="${tower.target===mode}" ${game.canEdit()?'':'disabled'}>${t(`target.${mode}`)}</button>`).join('')}</div></div>
    ${game.isNight()?`<p class="tm-note">${t('tower.sight',{range:(def.range*DARK.sight).toFixed(1)})}</p>`:''}`}
    <div class="tm-actions">${relay?'':`<button class="upgrade" type="button" ${!canUpgrade||game.credits<up||!game.canEdit()?'disabled':''}>${t(canUpgrade?'tower.upgrade':'tower.max')}${canUpgrade?`<small>${t('tower.upgradeCost',{cost:up})}</small>`:''}</button>`}
    <button class="sell" type="button" ${!game.canEdit()?'disabled':''}>${t('tower.sell')}<small>${t('tower.refund',{amount:sellValue(tower)})}</small></button></div>`;
  towerMenu.querySelector('.tm-close').addEventListener('click',()=>{closeMenus();updateHud();});
  for(const button of towerMenu.querySelectorAll('[data-target]'))button.addEventListener('click',()=>{if(game.setTargeting(tower.id,button.dataset.target))announceTarget(tower);});
  towerMenu.querySelector('.upgrade')?.addEventListener('click',()=>upgradeTower(tower));
  towerMenu.querySelector('.sell').addEventListener('click',()=>{game.sell(tower.id);closeMenus();updateHud();toast('toast.sold');});
  if(refocus)(towerMenu.querySelector(`${refocus}:not(:disabled)`)||towerMenu.querySelector('.sell'))?.focus({preventScroll:true});
}
function upgradeTower(tower){
  const result=game.upgrade(tower.id);
  if(!result.ok)toast(result.code);
  else toast(tower.powered?'toast.upgraded':'toast.upgradedOffline',()=>({name:towerName(tower.type),level:tower.level}));
  updateHud();
}
function place(element,x,y,width,height,{margin=8}={}){
  const left=Math.max(width/2+margin,Math.min(innerWidth-width/2-margin,x));
  element.style.left=left+'px';element.style.top=y+'px';return left;
}
function positionOverlays(){
  if(!renderer||selectedPad===null)return positionCoach();
  const pad=PADS[selectedPad],tower=towerAt(selectedPad);
  if(tower){
    const p=renderer.p(pad.x,pad.y,1.25),below=p.y<towerMenu.offsetHeight+insets.top*.6+30;
    towerMenu.classList.toggle('below',below);place(towerMenu,p.x,below?renderer.p(pad.x,pad.y,0).y:p.y,towerMenu.offsetWidth,towerMenu.offsetHeight);
    towerMenu.style.visibility=p.behind?'hidden':'';
  } else {
    const p=renderer.p(pad.x,pad.y,.3),flip=p.y<170;
    ring.style.left=p.x+'px';ring.style.top=p.y+'px';ring.style.visibility=p.behind?'hidden':'';
    // Five options fan out above the pad (below it near the top of the screen); the fan slides inwards at the side edges.
    const gap=innerWidth<640?62:74,half=2*gap+40,shift=Math.max(half+6,Math.min(innerWidth-half-6,p.x))-p.x;
    ringOptions.forEach((option,i)=>{const k=i-2,lift=70+22*(1-(k/2)**2);option.style.setProperty('--x',k*gap+shift+'px');option.style.setProperty('--y',(flip?lift:-lift)+'px');});
  }
  positionCoach();
}

// ————— Beam and abilities —————
function cancelAim(){aiming=false;if(renderer){renderer.aim=null;canvas.style.cursor='';}}
// The most valuable spot for a pool of light or a blast: lots of health close together, weighted towards the lighthouse.
function hotSpot(radius){
  let best=null,score=-1;
  for(const e of game.enemies){let s=0;for(const o of game.enemies)if(Math.hypot(o.x-e.x,o.y-e.y)<=radius)s+=o.hp;s*=.6+e.distance/PATH_LENGTH;if(s>score){score=s;best=e;}}
  return best&&{x:best.x,y:best.y};
}
function aimBeamAt(point){
  if(!game.canEdit())return;
  if(!onMap(point)){toast('toast.beamMiss');return;}
  if(game.aimBeam(point.x,point.y)){finishCoach('beam');updateHud();}
}
function beamAuto(){
  if(!game.canEdit())return;
  if(game.phase==='wave'&&game.enemies.length){const spot=hotSpot(BEAM.radius);if(spot)aimBeamAt(spot);return;}
  // Before a wave the beam waits at the first bend of the road, where the enemies climb ashore.
  aimBeamAt(pathPosition(3));toast('toast.beamHint');
}
function toggleStrike(){
  if(game.phase!=='wave'){toast('toast.strikeWave');return;}
  if(game.strikeCooldown>0){toast('toast.strikeWait',()=>({seconds:Math.ceil(game.strikeCooldown)}));return;}
  if(aiming){fireStrikeAt(hotSpot(STRIKE.radius));return;}
  closeMenus();aiming=true;buildType=null;renderer.buildType=null;toast('toast.strikeAim');updateHud();
}
function fireStrikeAt(point){
  if(!onMap(point)){toast('toast.strikeMiss');return;}
  if(game.activateStrike(point.x,point.y)){cancelAim();banner('banner.strike','banner.strikeKicker');}
  else if(game.paused)toast('phase.paused');
  updateHud();
}
function pause(){if(!game.canEdit())return;game.paused=!game.paused;if(game.paused)cancelAim();updateHud();}
function nextWave(){
  if(game.phase==='build'){game.startWave();buildType=null;renderer.buildType=null;closeMenus();persistBest();updateHud();}
  else if(game.phase==='wave')pause();
  else $('result-dialog').showModal();
}
$('next-wave').addEventListener('click',nextWave);
$('pause').addEventListener('click',pause);$('resume').addEventListener('click',pause);
$('speed').addEventListener('click',()=>{game.speed=game.speed===1?2:1;$('speed').textContent=game.speed+'×';toast('toast.speed',{speed:game.speed});});
$('grid-toggle').addEventListener('click',()=>{gridOn=!gridOn;renderer.grid=gridOn;$('grid-toggle').classList.toggle('active',gridOn);$('grid-toggle').setAttribute('aria-pressed',String(gridOn));});
$('grid-upgrade').addEventListener('click',()=>{if(game.upgradeGrid()){toast('toast.grid');updateHud();}});
$('overdrive').addEventListener('click',()=>{if(game.activateOverdrive()){banner('banner.overdrive','banner.overdriveKicker');updateHud();}});
$('strike').addEventListener('click',toggleStrike);
$('beam').addEventListener('click',beamAuto);
$('camera-reset').addEventListener('click',()=>renderer.resetView?.());
$('quality').addEventListener('click',()=>{
  quality=QUALITIES[(QUALITIES.indexOf(quality)+1)%QUALITIES.length];
  if(quality!=='classic'&&!webgl)quality='classic';
  write('last-beacon-quality',quality);createRenderer();drawIcons();toast('toast.quality',()=>({quality:t(`quality.${quality}`)}));
});
$('sound').addEventListener('click',async()=>{
  try {const enabled=await audio.toggle();updateSoundButton();toast(enabled?'toast.soundOn':'toast.soundOff');}
  catch{toast('toast.soundError');}
});
function setLog(open){$('log').hidden=!open;$('log-toggle').setAttribute('aria-expanded',String(open));lastLog='';updateHud();}
$('log-toggle').addEventListener('click',()=>setLog($('log').hidden));
$('log-close').addEventListener('click',()=>setLog(false));
function closeSystemMenu(){$('system-menu').classList.remove('open');$('menu-toggle').setAttribute('aria-expanded','false');}
$('menu-toggle').addEventListener('click',()=>{const open=!$('system-menu').classList.contains('open');$('system-menu').classList.toggle('open',open);$('menu-toggle').setAttribute('aria-expanded',String(open));});
function openDialog(id){pauseBeforeDialog=game.paused;game.paused=true;cancelAim();closeSystemMenu();$(id).showModal();updateHud();}
function closeDialog(id){$(id).close();}
for(const id of ['help-dialog','restart-dialog'])$(id).addEventListener('close',()=>{game.paused=pauseBeforeDialog;updateHud();});
$('help').addEventListener('click',()=>openDialog('help-dialog'));
document.querySelector('.close-dialog').addEventListener('click',()=>closeDialog('help-dialog'));
document.querySelector('.close-help').addEventListener('click',()=>closeDialog('help-dialog'));
function paintDifficulty(){
  for(const button of document.querySelectorAll('[data-difficulty]')){const on=button.dataset.difficulty===pendingDifficulty;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));}
  $('difficulty-note').textContent=t(`difficulty.${pendingDifficulty}Note`);
}
for(const button of document.querySelectorAll('[data-difficulty]'))button.addEventListener('click',()=>{pendingDifficulty=button.dataset.difficulty;paintDifficulty();});
$('restart').addEventListener('click',()=>{pendingDifficulty=difficulty;paintDifficulty();openDialog('restart-dialog');});
$('cancel-restart').addEventListener('click',()=>closeDialog('restart-dialog'));
$('confirm-restart').addEventListener('click',()=>{difficulty=pendingDifficulty;write('last-beacon-difficulty',difficulty);reset();});
$('play-again').addEventListener('click',reset);
$('view-island').addEventListener('click',()=>closeDialog('result-dialog'));
$('endless').addEventListener('click',()=>{if(game.continueEndless()){closeDialog('result-dialog');persistBest();updateHud();}});
// Inside the build ring or a tower card, a keyboard-focused button keeps Space for itself (build, upgrade, sell, targeting).
// Everywhere else, and after pointer clicks, Space stays the start / pause shortcut; Enter still activates any focused button.
let keyboardNavigation=false;
addEventListener('pointerdown',()=>{keyboardNavigation=false;},true);
addEventListener('keydown',e=>{if(e.key==='Tab'||e.key==='Enter')keyboardNavigation=true;},true);
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||e.target.matches('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.code==='Space'&&keyboardNavigation&&e.target.closest?.('#build-ring,#tower-menu'))return;
  if(e.code==='Space')e.preventDefault();
  const key=e.key.toLowerCase(),view=renderer.kind==='3d';
  if(view&&['q','e','arrowleft','arrowright'].includes(key)){e.preventDefault();renderer.rotateView(key==='q'||key==='arrowleft'?-1:1);return;}
  if(view&&['+','=','-','_','arrowup','arrowdown'].includes(key)){e.preventDefault();renderer.zoomView(['+','=','arrowup'].includes(key)?1:-1);return;}
  if(e.repeat)return;
  if(['1','2','3','4','5'].includes(e.key)){e.preventDefault();selectType(BUILD_KEYS[Number(e.key)-1]);}
  else if(e.key==='Escape'){cancelAim();buildType=null;if(renderer)renderer.buildType=null;closeMenus();closeSystemMenu();updateHud();}
  else if(e.code==='Space'){e.preventDefault();game.phase==='build'?nextWave():pause();}
  else if(key==='g')$('grid-toggle').click();
  else if(key==='m')$('sound').click();
  else if(key==='f')toggleStrike();
  else if(key==='o')$('overdrive').click();
  else if(key==='b')beamAuto();
  else if(key==='l')setLog($('log').hidden);
  else if(key==='u'){const tower=selectedPad!==null&&towerAt(selectedPad);if(tower&&tower.type!=='relay')upgradeTower(tower);}
  else if(key==='t'){const tower=selectedPad!==null&&towerAt(selectedPad);if(tower&&game.cycleTargeting(tower.id))announceTarget(tower);}
});
document.addEventListener('visibilitychange',()=>{audio.setHidden(document.hidden);if(document.hidden&&game.phase==='wave'&&!game.paused){game.paused=true;cancelAim();updateHud();}});
function announceTarget(tower){toast('toast.target',()=>({name:towerName(tower.type),mode:t(`target.${tower.target}`)}));updateHud();}

// ————— First-watch guidance, anchored to the island or to the HUD —————
const COACH_KEY='last-beacon-coach',COACH_PAD=3;
let coachDone=new Set();try{coachDone=new Set(JSON.parse(read(COACH_KEY)||'[]'));}catch{}
let coach=null,coachKey='',coachShown=0;
function finishCoach(step){if(coachDone.has(step))return;coachDone.add(step);write(COACH_KEY,JSON.stringify([...coachDone]));if(coach?.step===step)coach=null;}
$('coach-close').addEventListener('click',()=>{if(coach)finishCoach(coach.step);coachKey='';updateCoach();});
function currentCoach(){
  const g=game,built=g.towers.length>1;
  if(!coachDone.has('build')&&g.wave===0&&g.phase==='build'&&!built)return {step:'build',world:PADS[COACH_PAD],z:.4};
  if(!coachDone.has('start')&&g.wave===0&&g.phase==='build'&&built)return {step:'start',element:$('next-wave'),side:'left'};
  if(!coachDone.has('beam')&&g.phase==='wave'&&g.enemies.length&&!g.beam.spot)return {step:'beam',world:pathPosition(4.5),z:.2};
  if(!coachDone.has('night')&&g.phase==='build'&&isNightWave(g.wave+1))return {step:'night',element:document.querySelector('.wave-card'),side:'below'};
  return null;
}
function updateCoach(){
  if(coach?.step==='beam'&&performance.now()-coachShown>16000)finishCoach('beam');
  if(coach?.step==='build'&&game.towers.length>1)finishCoach('build');
  if(coach?.step==='start'&&game.phase!=='build')finishCoach('start');
  if(coach?.step==='night'&&game.phase!=='build')finishCoach('night');
  // Hints step aside while a dialog or an in-world menu is open.
  const next=document.querySelector('dialog[open]')||selectedPad!==null?null:currentCoach();
  if(next?.step!==coach?.step)coachShown=performance.now();
  coach=next;if(renderer)renderer.highlight=coach?.step==='build'?COACH_PAD:null;
  const key=coach?`${coach.step}:${getLanguage()}`:'';
  if(key===coachKey)return;coachKey=key;
  $('coach').hidden=!coach;if(!coach)return;
  $('coach-text').innerHTML=t(`coach.${coach.step}`);positionCoach();
}
function positionCoach(){
  const box=$('coach');if(!coach||box.hidden)return;
  box.classList.remove('below','left');
  if(coach.world){
    const p=renderer.p(coach.world.x,coach.world.y,coach.z),below=p.y<box.offsetHeight+insets.top+20;
    box.classList.toggle('below',below);place(box,p.x,p.y,box.offsetWidth,box.offsetHeight,{margin:12});box.style.visibility=p.behind?'hidden':'';
  } else {
    const r=coach.element.getBoundingClientRect();box.style.visibility='';
    if(coach.side==='left'){box.classList.add('left');box.style.left=r.left+'px';box.style.top=(r.top+r.height/2)+'px';}
    else{box.classList.add('below');place(box,r.left+Math.min(r.width/2,150),r.bottom,box.offsetWidth,box.offsetHeight,{margin:12});}
    // Phones have no room beside the button, so the hint sits above it.
    if(innerWidth<640&&coach.side==='left'){box.classList.remove('left');place(box,innerWidth/2,r.top,box.offsetWidth,box.offsetHeight);}
  }
}

// ————— Keeper's log —————
function updateLog(){
  if($('log').hidden)return;
  const upcoming=waveDefinition(game.phase==='build'?game.wave+1:game.wave),night=isNightWave(game.phase==='build'?game.wave+1:Math.max(1,game.wave));
  const key=JSON.stringify([getLanguage(),game.phase,game.wave,game.kills,game.towers.length,Math.floor(game.elapsed),game.endless]);
  if(key===lastLog)return;lastLog=key;
  const panel=$('selection');
  const stats=items=>`<div class="log-stats">${items.map(([label,value])=>`<div><span>${t(label)}</span><strong>${value}</strong></div>`).join('')}</div>`;
  if(game.wave===0&&game.phase==='build'){
    panel.innerHTML=`<p class="eyebrow">YOUR FIRST WATCH</p><h3>${t('brief.title')}</h3><p class="description">${t('brief.description')}</p>
      <div class="steps">${[1,2,3].map(step=>`<div><span>0${step}</span><p>${t(`brief.step${step}`)}</p></div>`).join('')}</div>
      <div class="field-note"><span>↗</span><p>${t('brief.note')}</p></div>`;
    return;
  }
  const fighting=game.phase==='wave';
  const tip=night?'tip.night':upcoming.units.some(([type])=>type==='splitter')?'tip.splitter':game.wave>=8?'tip.heavy':game.wave>=3?'tip.strike':'tip.corners';
  panel.innerHTML=`<p class="eyebrow">${fighting?'HOLD THE LINE':'A MOMENT OF CALM'}</p>
    <h3>${t(fighting?'battle.title':game.phase==='won'?'result.wonTitle':game.phase==='lost'?(game.endless?'result.endlessTitle':'result.lostTitle'):'calm.title')}</h3>
    <p class="description">${t(fighting?'battle.description':game.canEdit()?'calm.description':'end.description',{reward:game.lastReward})}</p>
    ${stats([['stat.kills',game.kills],['stat.towers',game.towers.length],['stat.time',`${Math.floor(game.elapsed/60)}:${String(Math.floor(game.elapsed%60)).padStart(2,'0')}`]])}
    <div class="field-note"><span>↗</span><p>${t(tip)}</p></div>`;
}

// ————— HUD —————
function meter(button,fill){button.style.setProperty('--fill',`${Math.round(Math.max(0,Math.min(1,fill))*100)}%`);}
function ability(id,name,hint){const b=$(id);b.querySelector('b').textContent=name;b.querySelector('small').textContent=hint;return b;}
function updateHud(){
  $('health').innerHTML=`${game.hp}<span> / 100</span>`;$('credits').textContent=game.credits;
  $('power').innerHTML=`${game.powerUsed}<span> / ${game.capacity}</span>`;
  $('health').closest('.resource').classList.toggle('low',game.hp<=30);
  if(game.credits>shownCredits){const r=$('credits').closest('.resource');r.classList.remove('bump');void r.offsetWidth;r.classList.add('bump');}
  shownCredits=game.credits;
  const shown=game.phase==='build'?game.wave+1:Math.max(1,game.wave),number=game.endless?shown:Math.min(shown,10),def=waveDefinition(number),block=Math.floor((number-1)/10)*10;
  const cleared=game.wave-(['wave','lost'].includes(game.phase)?1:0),night=isNightWave(number);
  $('wave-number').textContent=String(number).padStart(2,'0');$('wave-total').textContent=game.endless?'/ ∞':'/ 10';
  $('wave-name').textContent=number>10?t('wave.endless',{wave:number}):t(`wave.${number}`);
  $('wave-sky').textContent=game.phase==='won'?t('sky.dawn'):(night?'☾ ':'')+t(`sky.${def.sky}`);
  $('wave-sky').className=`sky-chip ${night?'night':def.sky==='storm'||def.sky==='drizzle'?'storm':''}`;
  $('wave-progress').innerHTML=Array.from({length:10},(_,i)=>{const w=block+i+1;return `<span class="${w<=cleared?'complete':w===number?'current':''} ${isNightWave(w)?'night':''}"></span>`;}).join('');
  $('enemy-count').textContent=t(game.phase==='wave'?'wave.remaining':'wave.targets',{count:game.phase==='wave'?game.enemies.length+game.queue.length:def.units.reduce((s,u)=>s+u[1],0)});
  $('enemy-preview').innerHTML=def.units.map(([type,count])=>`<span style="--enemy:${ENEMIES[type].color}"><i></i>${t(`enemy.${type}`)} ×${count}</span>`).join('');
  const offline=game.towers.filter(tower=>!tower.powered).length;
  $('grid-warning').hidden=!offline;$('grid-warning').textContent=t('grid.warning',{count:offline});
  const maxGrid=game.gridLevel>=game.maxGridLevel();
  $('grid-price').textContent=maxGrid?t('grid.max'):`◇ ${game.gridCost()}`;
  $('grid-upgrade').disabled=maxGrid||!game.canEdit();$('grid-upgrade').classList.toggle('unaffordable',!maxGrid&&game.credits<game.gridCost());
  const building=game.phase==='build';
  $('next-wave').innerHTML=`<span>${t(building?game.wave===0?'action.firstWave':'action.nextWave':game.phase==='wave'?game.paused?'action.resume':'action.pause':'action.record')}</span><b>${game.phase==='wave'&&!game.paused?'Ⅱ':'→'}</b>`;
  $('next-wave').classList.toggle('ready',building&&game.towers.length>1);
  $('wave-hint').textContent=t(building?'hint.build':game.phase==='wave'?'hint.wave':'hint.end');
  const b=game.beam,beam=ability('beam',t('beam.name'),b.spot?(game.phase==='wave'?t('beam.left',{seconds:Math.ceil(b.hold)}):t('beam.waiting')):t('beam.hint'));
  beam.classList.toggle('on',!!b.spot);beam.disabled=!game.canEdit();meter(beam,b.spot?b.hold/BEAM.hold:0);
  const od=ability('overdrive',t(game.overdrive>0?'overdrive.active':'overdrive.name'),t(game.overdrive>0?'overdrive.left':game.overdriveCooldown>0?'overdrive.ready':'overdrive.hint',{seconds:Math.ceil(game.overdrive>0?game.overdrive:game.overdriveCooldown)}));
  od.disabled=game.phase!=='wave'||game.overdriveCooldown>0||game.paused;od.classList.toggle('on',game.overdrive>0);
  meter(od,game.overdrive>0?game.overdrive/6:game.overdriveCooldown>0?1-game.overdriveCooldown/35:0);
  const strike=ability('strike',t('strike.name'),t(aiming?'strike.aiming':game.strikeCooldown>0?'strike.ready':'strike.hint',{seconds:Math.ceil(game.strikeCooldown)}));
  strike.disabled=game.phase!=='wave'||game.strikeCooldown>0||game.paused;strike.classList.toggle('aiming',aiming);meter(strike,game.strikeCooldown>0?1-game.strikeCooldown/STRIKE.cooldown:0);
  $('phase-tag').classList.toggle('fighting',game.phase==='wave');
  $('phase-tag').innerHTML=`<i></i> ${t(game.paused?'phase.paused':`phase.${game.phase}`)}`;
  $('paused-label').hidden=!game.paused||!game.canEdit()||!!document.querySelector('dialog[open]');
  $('pause').textContent=game.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',t(game.paused?'control.resume':'control.pause'));$('pause').disabled=!game.canEdit();
  for(const card of cards){card.classList.toggle('selected',card.dataset.type===buildType);card.setAttribute('aria-pressed',String(card.dataset.type===buildType));card.classList.toggle('unaffordable',game.credits<TYPES[card.dataset.type].cost);card.disabled=!game.canEdit();}
  $('build-hint').textContent=buildType?t('build.selected',{name:towerName(buildType)}):t('build.hint');
  PADS.forEach((pad,i)=>{
    const tower=towerAt(pad.id),title=t('pad.title',{number:String(pad.id+1).padStart(2,'0')});
    const detail=tower?t('pad.occupied',{name:towerName(tower.type),level:tower.level,power:t(tower.powered?'pad.powered':'pad.offline')}):t('pad.empty');
    padButtons[i].title=title;padButtons[i].setAttribute('aria-label',`${title} · ${detail}`);
  });
  const best=record(),level=t(`difficulty.${game.difficulty}`);
  $('best-record').textContent=`${level} · ${t(best.endless>10?'status.bestEndless':best.won?'status.bestWon':best.wave?'status.bestWave':'status.author',{wave:best.endless>10?best.endless:best.wave})}`;
  renderMenus();updateLog();updateCoach();
}
function renderResult(){
  const won=game.phase==='won',endless=game.endless;
  $('result-kicker').textContent=won?'THE LIGHT REMAINS':endless?'THE TIDE NEVER ENDS':'UNTIL THE NEXT DAWN';
  $('result-title').textContent=t(won?'result.wonTitle':endless?'result.endlessTitle':'result.lostTitle');
  $('result-copy').textContent=t(won?'result.wonCopy':endless?'result.endlessCopy':'result.lostCopy',{wave:Math.max(11,game.wave)});
  $('result-stats').innerHTML=`<div><strong>${game.wave}</strong><span>${t('stat.wave')}</span></div><div><strong>${game.kills}</strong><span>${t('stat.kills')}</span></div><div><strong>${game.hp}</strong><span>${t('stat.health')}</span></div>`;
  $('endless').hidden=!won||endless;
}
// The result waits a moment so the victory or defeat shot can play first.
function showResult(delay=0){persistBest();renderResult();setTimeout(()=>{if(['won','lost'].includes(game.phase)&&!$('result-dialog').open)$('result-dialog').showModal();},delay);}
function panOf(e){
  if(!Number.isFinite(e.x)||!renderer.w)return 0;
  return Math.max(-1,Math.min(1,renderer.p(e.x,e.y,0).x/renderer.w*2-1))*.8;
}
function handleEvents(){
  for(const e of game.events){
    audio.play(e.type,{kind:e.kind,enemyType:e.enemyType,pan:panOf(e)});
    renderer.onEvent(e);
    if(e.type==='wave'){const endless=e.wave>10,night=isNightWave(e.wave);banner(endless?'wave.endless':`wave.${e.wave}`,night?(endless?'banner.waveEndlessNight':'banner.waveNight'):endless?'banner.waveEndless':'banner.wave',{wave:String(e.wave).padStart(2,'0')},night);}
    if(e.type==='clear'){toast('toast.clear',{wave:game.wave,reward:e.reward});persistBest();cancelAim();}
    if(e.type==='boss')banner('banner.boss','banner.bossKicker');
    if(e.type==='endless')banner('banner.endless','banner.endlessKicker');
    if(e.type==='won'||e.type==='lost'){cancelAim();closeMenus();showResult(renderer.kind==='3d'&&!renderer.rig?.calm?2600:600);}
  }
  game.events.length=0;
}
function updateBossBar(){
  const boss=game.enemies.find(e=>e.type==='boss'&&e.hp>0),width=boss?Math.max(0,boss.hp/boss.maxHp*100).toFixed(1):null;
  if(width===bossShown)return;bossShown=width;
  $('boss-bar').hidden=!boss;if(boss)$('boss-fill').style.width=width+'%';
}
function frame(now){
  const elapsed=Math.max(0,(now-previous)/1000),dt=Math.min(elapsed,.05);previous=now;game.tick(dt);handleEvents();
  renderer.draw(game.paused?0:dt,Math.min(elapsed,.25));
  if(renderer.kind==='3d')positionPads();
  positionOverlays();updateBossBar();
  if(now-lastHud>180){updateHud();lastHud=now;audio.setAmbience(renderer.ambience?.());}
  requestAnimationFrame(frame);
}
updateInsets(true);createRenderer();drawIcons();applyLanguage();requestAnimationFrame(frame);
// Automated browser checks drive the game through this hook; it only exists with ?debug in the URL.
if(new URLSearchParams(location.search).has('debug'))window.lastBeacon={get game(){return game;},get renderer(){return renderer;},activatePad,selectType,toggleStrike,fireStrikeAt,aimBeamAt,beamAuto,openMenu,closeMenus};
if(renderer.kind==='3d'&&!read('last-beacon-camera-hint'))setTimeout(()=>{if(!activeToast&&!coach){toast('toast.cameraHint');write('last-beacon-camera-hint','1');}},9000);
