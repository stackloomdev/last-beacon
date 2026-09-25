import {Game,PADS,TYPES,ENEMIES,TARGETING,STRIKE,DIFFICULTIES,PATH_LENGTH,towerStats,upgradeCost,sellValue,waveDefinition} from './game.js';
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
let previous=performance.now(),lastHud=0,lastSelection='',toastTimer,bannerTimer,pauseBeforeDialog=false,bossShown=null;
const records=Object.fromEntries(Object.keys(DIFFICULTIES).map(d=>[d,{wave:0,won:false,endless:0}]));
try{
  const stored=JSON.parse(read('last-beacon-best')||'null');
  // Earlier versions stored a single {wave,won} record for the only (normal) difficulty.
  const legacy=stored&&Number.isInteger(stored.wave)?{normal:stored}:stored||{};
  for(const d of Object.keys(records)){const r=legacy[d];if(r&&Number.isInteger(r.wave)&&r.wave>=0&&r.wave<=10)records[d]={wave:r.wave,won:r.won===true,endless:Number.isInteger(r.endless)&&r.endless>10?r.endless:0};}
}catch{}
const cards=[...document.querySelectorAll('.build-card')];

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
  if(activeBanner)$('wave-banner').innerHTML=`<small>${t(activeBanner.kicker,activeBanner.params)}</small><strong>${t(activeBanner.title,activeBanner.params)}</strong>`;
}
function banner(title,kicker,params={}){
  activeBanner={title,kicker,params};paintBanner();$('wave-banner').classList.add('show');clearTimeout(bannerTimer);
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
  updateSoundButton();updateQualityButton();paintDifficulty();lastSelection='';updateHud();paintToast();paintBanner();
  if(['won','lost'].includes(game.phase))renderResult();
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
function bindCanvas(){
  const local=event=>{const r=canvas.getBoundingClientRect();return [event.clientX-r.left,event.clientY-r.top];};
  canvas.addEventListener('mapresize',positionPads);
  canvas.addEventListener('pointermove',event=>{
    const [x,y]=local(event);
    if(aiming){renderer.aim=renderer.pickGround(x,y);canvas.style.cursor='crosshair';hoverPad=null;renderer.hover=null;return;}
    if(renderer.kind==='3d'&&event.buttons)return;
    const pad=renderer.hitPad(x,y);hoverPad=pad?.id??null;renderer.hover=hoverPad;canvas.style.cursor=pad?'pointer':renderer.kind==='3d'?'grab':'default';
  });
  canvas.addEventListener('pointerleave',()=>{hoverPad=null;renderer.hover=null;if(aiming)renderer.aim=null;});
  canvas.addEventListener('click',event=>{
    if(renderer.consumeClick())return;
    const [x,y]=local(event);
    if(aiming){fireStrikeAt(renderer.pickGround(x,y));return;}
    const pad=renderer.hitPad(x,y);
    if(pad)activatePad(pad.id);
    else if(buildType||selectedPad!==null){buildType=null;selectedPad=null;renderer.buildType=null;renderer.selected=null;lastSelection='';updateHud();}
  });
}
function freshCanvas(){const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;bindCanvas();return next;}
function createRenderer(){
  const view=renderer?.rig?.snapshot();
  renderer?.dispose?.();renderer=null;
  if(quality!=='classic'){
    try{renderer=new World3D(freshCanvas(),game,{quality,view});renderer.onSound=(kind,options)=>audio.play(kind,options);}
    catch(error){console.warn('3D view unavailable, using 2D.',error);quality='classic';toast('toast.webglFallback');}
  }
  if(!renderer)renderer=new Renderer(freshCanvas(),game);
  Object.assign(renderer,{hover:hoverPad,selected:selectedPad,buildType,grid:gridOn,aim:null});
  document.querySelector('.field').classList.toggle('three-d',renderer.kind==='3d');
  padPositions.length=0;positionPads();updateQualityButton();
}
function drawIcons(){
  const icons=[...document.querySelectorAll('[data-icon]')];
  if(quality!=='classic'){try{renderTowerIcons(icons);return;}catch(error){console.warn(error);}}
  for(const icon of icons)drawTowerIcon(icon,icon.dataset.icon);
}

function reset(){
  pauseBeforeDialog=false;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  game=new Game({difficulty});renderer.setGame(game);buildType=null;selectedPad=null;hoverPad=null;lastSelection='';cancelAim();
  renderer.hover=null;renderer.selected=null;renderer.buildType=null;
  clearTimeout(toastTimer);clearTimeout(bannerTimer);$('toast').classList.remove('visible');$('wave-banner').classList.remove('show');
  activeToast=null;activeBanner=null;$('toast').textContent='';$('wave-banner').textContent='';
  $('speed').textContent='1×';$('paused-label').hidden=true;updateHud();
  if(difficulty==='normal')toast('toast.reset');else toast('toast.difficulty',()=>({level:t(`difficulty.${difficulty}`)}));
}
function selectType(type){
  if(!game.canEdit()){toast('toast.ended');return;}
  cancelAim();buildType=buildType===type?null:type;selectedPad=null;renderer.buildType=buildType;renderer.selected=null;lastSelection='';updateHud();
}
function activatePad(id){
  const occupied=game.towers.find(t=>t.pad===id);
  if(occupied){selectedPad=id;buildType=null;renderer.buildType=null;renderer.selected=id;lastSelection='';updateHud();return;}
  if(!buildType){selectedPad=id;renderer.selected=id;toast('toast.choose');updateHud();return;}
  const result=game.build(buildType,id);
  if(!result.ok){toast(result.code);return;}
  selectedPad=id;buildType=null;renderer.buildType=null;renderer.selected=id;lastSelection='';
  if(!result.tower.connected)toast('toast.disconnected');
  else if(!result.tower.powered)toast('toast.overload');
  else toast('toast.connected',()=>({name:towerName(result.tower.type)}));
  updateHud();
}
const padButtons=PADS.map(p=>{
  const button=document.createElement('button');button.className='pad-control';button.dataset.pad=p.id;button.title=t('pad.title',{number:String(p.id+1).padStart(2,'0')});
  button.addEventListener('click',()=>activatePad(p.id));
  const focus=()=>{hoverPad=p.id;renderer.hover=p.id;};
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

// ————— Abilities —————
function cancelAim(){aiming=false;if(renderer){renderer.aim=null;canvas.style.cursor='';}}
function leadingTarget(){
  let best=null,score=-1;
  for(const e of game.enemies){let s=0;for(const o of game.enemies)if(Math.hypot(o.x-e.x,o.y-e.y)<=STRIKE.radius)s+=o.hp;s*=.6+e.distance/PATH_LENGTH;if(s>score){score=s;best=e;}}
  return best&&{x:best.x,y:best.y};
}
function toggleStrike(){
  if(game.phase!=='wave'){toast('toast.strikeWave');return;}
  if(game.strikeCooldown>0){toast('toast.strikeWait',()=>({seconds:Math.ceil(game.strikeCooldown)}));return;}
  if(aiming){fireStrikeAt(leadingTarget());return;}
  aiming=true;buildType=null;renderer.buildType=null;lastSelection='';toast('toast.strikeAim');updateHud();
}
function fireStrikeAt(point){
  if(!point){toast('toast.strikeMiss');return;}
  if(game.activateStrike(point.x,point.y)){cancelAim();banner('banner.strike','banner.strikeKicker');}
  else if(game.paused)toast('phase.paused');
  updateHud();
}
function pause(){if(!game.canEdit())return;game.paused=!game.paused;if(game.paused)cancelAim();updateHud();}
function nextWave(){
  if(game.phase==='build'){game.startWave();buildType=null;renderer.buildType=null;persistBest();lastSelection='';updateHud();}
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
$('camera-reset').addEventListener('click',()=>renderer.resetView?.());
$('quality').addEventListener('click',()=>{
  quality=QUALITIES[(QUALITIES.indexOf(quality)+1)%QUALITIES.length];
  if(quality!=='classic'&&!webgl)quality='classic';
  write('last-beacon-quality',quality);createRenderer();toast('toast.quality',()=>({quality:t(`quality.${quality}`)}));
});
$('sound').addEventListener('click',async()=>{
  try {const enabled=await audio.toggle();updateSoundButton();toast(enabled?'toast.soundOn':'toast.soundOff');}
  catch{toast('toast.soundError');}
});
function openDialog(id){pauseBeforeDialog=game.paused;game.paused=true;cancelAim();$(id).showModal();updateHud();}
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
$('endless').addEventListener('click',()=>{if(game.continueEndless()){closeDialog('result-dialog');persistBest();lastSelection='';updateHud();}});
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||e.target.matches('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.code==='Space')e.preventDefault();
  const key=e.key.toLowerCase(),view=renderer.kind==='3d';
  if(view&&['q','e','arrowleft','arrowright'].includes(key)){e.preventDefault();renderer.rotateView(key==='q'||key==='arrowleft'?-1:1);return;}
  if(view&&['+','=','-','_','arrowup','arrowdown'].includes(key)){e.preventDefault();renderer.zoomView(['+','=','arrowup'].includes(key)?1:-1);return;}
  if(e.repeat)return;
  if(['1','2','3','4','5'].includes(e.key)){e.preventDefault();selectType(BUILD_KEYS[Number(e.key)-1]);}
  else if(e.key==='Escape'){cancelAim();buildType=null;selectedPad=null;renderer.buildType=null;renderer.selected=null;lastSelection='';updateHud();}
  else if(e.code==='Space'){e.preventDefault();game.phase==='build'?nextWave():pause();}
  else if(key==='g')$('grid-toggle').click();
  else if(key==='m')$('sound').click();
  else if(key==='f')toggleStrike();
  else if(key==='o')$('overdrive').click();
  else if(key==='t'){const tower=game.towers.find(t=>t.pad===selectedPad);if(tower&&game.cycleTargeting(tower.id))announceTarget(tower);}
});
document.addEventListener('visibilitychange',()=>{audio.setHidden(document.hidden);if(document.hidden&&game.phase==='wave'&&!game.paused){game.paused=true;cancelAim();updateHud();}});
function announceTarget(tower){toast('toast.target',()=>({name:towerName(tower.type),mode:t(`target.${tower.target}`)}));lastSelection='';updateHud();}

// ————— Panels —————
function stats(items){return `<div class="tower-stats">${items.map(([label,value])=>`<div><span>${t(label)}</span><strong>${value}</strong></div>`).join('')}</div>`;}
function updateSelection(){
  const tower=game.towers.find(tower=>tower.pad===selectedPad);
  const key=JSON.stringify([getLanguage(),buildType,selectedPad,tower&&[tower.id,tower.level,tower.connected,tower.powered,tower.target],game.credits,game.phase,game.endless]);
  if(key===lastSelection)return;lastSelection=key;
  const panel=$('selection');panel.dataset.mode=tower?'tower':buildType?'build':'brief';
  if(tower){
    const def=towerStats(tower),up=upgradeCost(tower),canUpgrade=tower.type!=='relay'&&tower.level<3,relay=tower.type==='relay';
    const items=relay?[['stat.link','4.8'],['stat.power',def.power],['stat.cost','30']]:[['stat.damage',Math.round(def.damage)],...(def.chain?[['stat.chain',def.chain]]:[]),['stat.power',def.power],['stat.range',def.range.toFixed(1)]];
    panel.innerHTML=`<p class="eyebrow">${def.en}<span class="selected-id">LV.${tower.level} / 03</span></p>
      <h3>${towerName(tower.type)}</h3><p class="description">${t(`tower.${tower.type}.description`)}</p>
      <span class="tower-status ${tower.powered?'':'offline'}">● ${t(tower.powered?'tower.powered':tower.connected?'tower.overload':'tower.disconnected')}</span>
      ${stats(items)}
      ${relay?'':`<div class="targeting"><span>${t('target.label')} <em>${t('target.hint')}</em></span><div role="group" aria-label="${t('target.label')}">${TARGETING.map(mode=>`<button data-target="${mode}" class="${tower.target===mode?'active':''}" aria-pressed="${tower.target===mode}" ${game.canEdit()?'':'disabled'}>${t(`target.${mode}`)}</button>`).join('')}</div></div>`}
      <div class="selection-actions">${relay?'':`<button id="upgrade-tower" ${!canUpgrade||game.credits<up||!game.canEdit()?'disabled':''}>${t(canUpgrade?'tower.upgrade':'tower.max')}${canUpgrade?`<small>${t('tower.upgradeCost',{cost:up})}</small>`:''}</button>`}
      <button id="sell-tower" class="sell" ${!game.canEdit()?'disabled':''}>${t('tower.sell')}<small>${t('tower.refund',{amount:sellValue(tower)})}</small></button></div>
      <div class="field-note"><span>↗</span><p>${t(relay?'tower.relayNote':'tower.note')}</p></div>`;
    for(const button of panel.querySelectorAll('[data-target]'))button.addEventListener('click',()=>{if(game.setTargeting(tower.id,button.dataset.target))announceTarget(tower);});
    $('upgrade-tower')?.addEventListener('click',()=>{
      const result=game.upgrade(tower.id);
      if(!result.ok)toast(result.code);
      else toast(tower.powered?'toast.upgraded':'toast.upgradedOffline',()=>({name:towerName(tower.type),level:tower.level}));
      updateHud();
    });
    $('sell-tower').addEventListener('click',()=>{game.sell(tower.id);selectedPad=null;renderer.selected=null;updateHud();toast('toast.sold');});
  }else if(buildType){
    const def=TYPES[buildType],relay=buildType==='relay';
    panel.innerHTML=`<p class="eyebrow">DEPLOY / ${def.en}</p><h3>${towerName(buildType)}</h3><p class="description">${t(`tower.${buildType}.description`)}</p>
      ${stats([['stat.buildCost',def.cost],['stat.power',def.power],[relay?'stat.link':'stat.range',relay?'4.8':def.range.toFixed(1)],...(def.chain?[['stat.chain',def.chain]]:[])])}
      <div class="field-note"><span>＋</span><p>${t('build.preview')}</p></div><button class="build-cancel" id="cancel-build">${t('build.cancel')}</button>`;
    $('cancel-build').addEventListener('click',()=>selectType(buildType));
  }else if(game.wave===0){
    panel.innerHTML=`<p class="eyebrow">YOUR FIRST WATCH</p><h3>${t('brief.title')}</h3><p class="description">${t('brief.description')}</p>
      <div class="steps">${[1,2,3].map(step=>`<div><span>0${step}</span><p>${t(`brief.step${step}`)}</p></div>`).join('')}</div>
      <div class="field-note"><span>↗</span><p>${t('brief.note')}</p></div>`;
  }else{
    const fighting=game.phase==='wave',upcoming=waveDefinition(game.phase==='build'?game.wave+1:game.wave);
    const tip=upcoming.units.some(([type])=>type==='splitter')?'tip.splitter':game.wave>=8?'tip.heavy':game.wave>=3?'tip.strike':'tip.corners';
    panel.innerHTML=`<p class="eyebrow">${fighting?'HOLD THE LINE':'A MOMENT OF CALM'}</p>
      <h3>${t(fighting?'battle.title':game.phase==='won'?'result.wonTitle':game.phase==='lost'?(game.endless?'result.endlessTitle':'result.lostTitle'):'calm.title')}</h3>
      <p class="description">${t(fighting?'battle.description':game.canEdit()?'calm.description':'end.description',{reward:game.lastReward})}</p>
      ${stats([['stat.kills',game.kills],['stat.towers',game.towers.length],['stat.time',`${Math.floor(game.elapsed/60)}:${String(Math.floor(game.elapsed%60)).padStart(2,'0')}`]])}
      <div class="field-note"><span>↗</span><p>${t(tip)}</p></div>`;
  }
}
function updateHud(){
  $('health').innerHTML=`${game.hp}<span> / 100</span>`;$('credits').textContent=game.credits;
  $('power').innerHTML=`${game.powerUsed}<span> / ${game.capacity}</span>`;
  $('health').style.color=game.hp<=30?'#e3a082':'';
  const shown=game.phase==='build'?game.wave+1:Math.max(1,game.wave),number=game.endless?shown:Math.min(shown,10),def=waveDefinition(number),block=Math.floor((number-1)/10)*10;
  const cleared=game.wave-(['wave','lost'].includes(game.phase)?1:0);
  $('wave-number').textContent=String(number).padStart(2,'0');$('wave-total').textContent=game.endless?'/ ∞':'/ 10';
  $('wave-name').textContent=number>10?t('wave.endless',{wave:number}):t(`wave.${number}`);
  $('wave-progress').innerHTML=Array.from({length:10},(_,i)=>{const w=block+i+1;return `<span class="${w<=cleared?'complete':w===number?'current':''}"></span>`;}).join('');
  $('enemy-count').textContent=t(game.phase==='wave'?'wave.remaining':'wave.targets',{count:game.phase==='wave'?game.enemies.length+game.queue.length:def.units.reduce((s,u)=>s+u[1],0)});
  $('enemy-preview').innerHTML=def.units.map(([type,count])=>`<span style="--enemy:${ENEMIES[type].color}"><i></i>${t(`enemy.${type}`)} ×${count}</span>`).join('');
  const offline=game.towers.filter(tower=>!tower.powered).length;
  $('grid-warning').hidden=!offline;$('grid-warning').textContent=t('grid.warning',{count:offline});
  const maxGrid=game.gridLevel>=game.maxGridLevel();
  $('grid-price').textContent=maxGrid?t('grid.max'):`◇ ${game.gridCost()}`;
  $('grid-upgrade').disabled=maxGrid||game.credits<game.gridCost()||!game.canEdit();
  $('next-wave').innerHTML=`<span>${t(game.phase==='build'?game.wave===0?'action.firstWave':'action.nextWave':game.phase==='wave'?game.paused?'action.resume':'action.pause':'action.record')}</span><b>${game.phase==='wave'&&!game.paused?'Ⅱ':'→'}</b>`;
  $('wave-hint').textContent=t(game.phase==='build'?'hint.build':game.phase==='wave'?'hint.wave':'hint.end');
  $('abilities').hidden=game.phase!=='wave';$('overdrive').disabled=game.overdriveCooldown>0||game.paused;
  $('overdrive').innerHTML=`<span>ϟ ${t(game.overdrive>0?'overdrive.active':game.overdriveCooldown>0?'overdrive.cooling':'overdrive.name')}</span><small>${t(game.overdrive>0?'overdrive.left':game.overdriveCooldown>0?'overdrive.ready':'overdrive.hint',{seconds:Math.ceil(game.overdrive>0?game.overdrive:game.overdriveCooldown)})}</small>`;
  $('strike').disabled=game.strikeCooldown>0||game.paused;$('strike').classList.toggle('aiming',aiming);
  $('strike').innerHTML=`<span>✦ ${t(game.strikeCooldown>0?'strike.cooling':'strike.name')}</span><small>${t(aiming?'strike.aiming':game.strikeCooldown>0?'strike.ready':'strike.hint',{seconds:Math.ceil(game.strikeCooldown)})}</small>`;
  $('phase-tag').classList.toggle('fighting',game.phase==='wave');
  $('phase-tag').innerHTML=`<i></i> ${t(game.paused?'phase.paused':`phase.${game.phase}`)}`;
  $('paused-label').hidden=!game.paused||!game.canEdit()||!!document.querySelector('dialog[open]');
  $('pause').textContent=game.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',t(game.paused?'control.resume':'control.pause'));$('pause').disabled=!game.canEdit();
  for(const card of cards){card.classList.toggle('selected',card.dataset.type===buildType);card.setAttribute('aria-pressed',String(card.dataset.type===buildType));card.classList.toggle('unaffordable',game.credits<TYPES[card.dataset.type].cost);card.disabled=!game.canEdit();}
  $('build-hint').textContent=buildType?t('build.selected',{name:towerName(buildType)}):t('build.hint');
  PADS.forEach((pad,i)=>{
    const tower=game.towers.find(tower=>tower.pad===pad.id),title=t('pad.title',{number:String(pad.id+1).padStart(2,'0')});
    const detail=tower?t('pad.occupied',{name:towerName(tower.type),level:tower.level,power:t(tower.powered?'pad.powered':'pad.offline')}):t('pad.empty');
    padButtons[i].title=title;padButtons[i].setAttribute('aria-label',`${title} · ${detail}`);
  });
  const best=record(),level=t(`difficulty.${game.difficulty}`);
  $('best-record').textContent=`${level} · ${t(best.endless>10?'status.bestEndless':best.won?'status.bestWon':best.wave?'status.bestWave':'status.author',{wave:best.endless>10?best.endless:best.wave})}`;
  updateSelection();
}
function renderResult(){
  const won=game.phase==='won',endless=game.endless;
  $('result-kicker').textContent=won?'THE LIGHT REMAINS':endless?'THE TIDE NEVER ENDS':'UNTIL THE NEXT DAWN';
  $('result-title').textContent=t(won?'result.wonTitle':endless?'result.endlessTitle':'result.lostTitle');
  $('result-copy').textContent=t(won?'result.wonCopy':endless?'result.endlessCopy':'result.lostCopy',{wave:Math.max(11,game.wave)});
  $('result-stats').innerHTML=`<div><strong>${game.wave}</strong><span>${t('stat.wave')}</span></div><div><strong>${game.kills}</strong><span>${t('stat.kills')}</span></div><div><strong>${game.hp}</strong><span>${t('stat.health')}</span></div>`;
  $('endless').hidden=!won||endless;
}
function showResult(){persistBest();renderResult();$('result-dialog').showModal();}
function panOf(e){
  if(!Number.isFinite(e.x)||!renderer.w)return 0;
  return Math.max(-1,Math.min(1,renderer.p(e.x,e.y,0).x/renderer.w*2-1))*.8;
}
function handleEvents(){
  for(const e of game.events){
    audio.play(e.type,{kind:e.kind,enemyType:e.enemyType,pan:panOf(e)});
    renderer.onEvent(e);
    if(e.type==='wave'){const endless=e.wave>10;banner(endless?'wave.endless':`wave.${e.wave}`,endless?'banner.waveEndless':'banner.wave',{wave:String(e.wave).padStart(2,'0')});}
    if(e.type==='clear'){toast('toast.clear',{wave:game.wave,reward:e.reward});persistBest();cancelAim();}
    if(e.type==='boss')banner('banner.boss','banner.bossKicker');
    if(e.type==='endless')banner('banner.endless','banner.endlessKicker');
    if(e.type==='won'||e.type==='lost'){cancelAim();showResult();}
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
  updateBossBar();
  if(now-lastHud>180){updateHud();lastHud=now;audio.setAmbience(renderer.ambience?.());}
  requestAnimationFrame(frame);
}
createRenderer();drawIcons();applyLanguage();requestAnimationFrame(frame);
// Automated browser checks drive the game through this hook; it only exists with ?debug in the URL.
if(new URLSearchParams(location.search).has('debug'))window.lastBeacon={get game(){return game;},get renderer(){return renderer;},activatePad,selectType,toggleStrike,fireStrikeAt};
if(renderer.kind==='3d'&&!read('last-beacon-camera-hint'))setTimeout(()=>{if(!activeToast){toast('toast.cameraHint');write('last-beacon-camera-hint','1');}},3800);
