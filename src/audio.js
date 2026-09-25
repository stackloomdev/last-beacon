// Original synthesized sound effects and ambience. No samples, downloads, or audio permissions.
export class AudioEngine {
  constructor(){this.enabled=false;this.ctx=null;this.last={};}
  async toggle(){
    if(!this.ctx&&!this.init())return false;
    if(this.ctx.state==='suspended')await this.ctx.resume();
    this.enabled=!this.enabled;
    this.master.gain.setTargetAtTime(this.enabled?.9:0,this.ctx.currentTime,.05);
    if(this.enabled)this.play('build');
    return this.enabled;
  }
  init(){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
    const ctx=this.ctx=new Audio(),comp=ctx.createDynamicsCompressor();
    comp.threshold.value=-16;comp.ratio.value=5;comp.attack.value=.004;comp.release.value=.2;
    this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(comp);comp.connect(ctx.destination);
    const length=ctx.sampleRate*2,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=Math.random()*2-1;this.noiseBuffer=buffer;
    // Ambience: surf, wind and rain beds that follow the weather.
    const bed=(type,frequency,q)=>{const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;src.playbackRate.value=.6+Math.random()*.2;
      const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;const gain=ctx.createGain();gain.gain.value=0;
      src.connect(filter);filter.connect(gain);gain.connect(this.master);src.start();return {gain,filter};};
    this.surf=bed('lowpass',380,.7);this.wind=bed('bandpass',650,.55);this.rain=bed('highpass',1900,.4);
    const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=.085;depth.gain.value=160;lfo.connect(depth);depth.connect(this.surf.filter.frequency);lfo.start();
    this.mood={rain:0,wind:.35,waves:1,storm:0,night:0};this.chirp=0;
    return true;
  }
  // Background tabs stay silent; the looping beds would otherwise keep playing.
  setHidden(hidden){if(!this.ctx)return;if(hidden)this.ctx.suspend();else if(this.enabled)this.ctx.resume();}
  setAmbience(mood){
    if(!this.ctx||!mood)return;
    const t=this.ctx.currentTime,m=this.mood=mood;
    this.surf.gain.gain.setTargetAtTime(.035+.03*Math.min(2.5,m.waves),t,.8);
    this.wind.gain.gain.setTargetAtTime(.008+.03*m.wind,t,.8);this.wind.filter.frequency.setTargetAtTime(500+500*m.wind,t,1);
    this.rain.gain.gain.setTargetAtTime(.055*m.rain,t,.6);
    if(this.enabled&&m.night>.55&&m.rain<.1&&(this.chirp-=1)<=0&&Math.random()<.04){this.chirp=12;for(let i=0;i<3;i++)this.tone(4300+Math.random()*300,.05,'sine',.006,i*.09+Math.random()*.02,4100);}
  }
  output(pan=0,delay=0){
    const t=this.ctx.currentTime+delay;
    if(!pan||!this.ctx.createStereoPanner)return {at:t,node:this.master};
    const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-.85,Math.min(.85,pan));p.connect(this.master);setTimeout(()=>p.disconnect(),(delay+3)*1000);
    return {at:t,node:p};
  }
  tone(freq,duration=.12,type='sine',volume=.035,delay=0,endFreq=freq,pan=0){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const {at,node}=this.output(pan,delay),osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(node);osc.start(at);osc.stop(at+duration+.02);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  noise(duration,{type='lowpass',frequency=1000,to=frequency,q=.7,volume=.05,delay=0,pan=0,attack=.004}={}){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const {at,node}=this.output(pan,delay),src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
    src.buffer=this.noiseBuffer;src.playbackRate.value=.9+Math.random()*.2;filter.type=type;filter.Q.value=q;
    filter.frequency.setValueAtTime(frequency,at);filter.frequency.exponentialRampToValueAtTime(Math.max(40,to),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    src.connect(filter);filter.connect(gain);gain.connect(node);src.start(at,Math.random()*1.5);src.stop(at+duration+.05);
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
  }
  horn(freq,duration,volume,delay=0){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const {at,node}=this.output(0,delay),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
    filter.type='lowpass';filter.frequency.value=freq*5.5;filter.Q.value=1.4;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.3);gain.gain.setValueAtTime(volume,at+duration-.5);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    filter.connect(gain);gain.connect(node);
    for(const [f,type] of [[freq,'sawtooth'],[freq*1.007,'sawtooth'],[freq/2,'sine']]){const osc=this.ctx.createOscillator();osc.type=type;osc.frequency.value=f;osc.connect(filter);osc.start(at);osc.stop(at+duration+.05);osc.onended=()=>osc.disconnect();}
    setTimeout(()=>{filter.disconnect();gain.disconnect();},(delay+duration+.3)*1000);
  }
  limited(kind,gap){const now=this.ctx.currentTime;if(now-(this.last[kind]||0)<gap)return true;this.last[kind]=now;return false;}
  play(kind,{pan=0,kind:sub,gain=1,delay=0,enemyType}={}){
    if(!this.enabled||!this.ctx)return;
    if(kind==='shoot') {
      if(sub==='mortar'){this.tone(110,.2,'sine',.09*gain,0,42,pan);this.noise(.18,{frequency:900,to:200,volume:.05,pan});}
      else if(sub==='frost'){if(this.limited('frost',.08))return;this.tone(1320,.22,'sine',.012,0,1250,pan);this.tone(1980,.16,'sine',.008,.01,1900,pan);this.noise(.12,{type:'highpass',frequency:5000,volume:.012,pan});}
      else if(sub==='arc'){if(this.limited('arc',.06))return;for(let i=0;i<4;i++)this.noise(.04,{type:'bandpass',frequency:2400+Math.random()*1800,q:2.5,volume:.05,delay:i*.028,pan});this.tone(90,.13,'sawtooth',.02,0,70,pan);}
      else{if(this.limited('gun',.055))return;this.noise(.05,{type:'bandpass',frequency:1700,q:.9,volume:.05,pan});this.tone(170,.05,'triangle',.02,0,70,pan);}
    }
    else if(kind==='blast'){if(this.limited('blast',.05))return;this.noise(.65,{frequency:2600,to:170,volume:.11,pan});this.tone(72,.5,'sine',.08,0,34,pan);}
    else if(kind==='kill'){
      if(enemyType==='boss'){this.noise(1.6,{frequency:3200,to:90,volume:.16,pan});this.tone(60,1.4,'sine',.12,0,24,pan);return;}
      if(this.limited('kill',.04))return;this.noise(.08,{type:'bandpass',frequency:3000,q:1.2,volume:.025,pan});this.tone(560,.07,'square',.006,0,260,pan);
    }
    else if(kind==='split'){this.noise(.16,{type:'bandpass',frequency:420,q:2,volume:.05,pan});this.tone(300,.16,'sine',.02,0,110,pan);}
    else if(kind==='build'||kind==='upgrade'||kind==='grid'){this.noise(.07,{type:'bandpass',frequency:900,q:1.5,volume:.04,pan});this.tone(520,.14,'sine',.03,0,520,pan);this.tone(780,.22,'sine',.025,.09,780,pan);}
    else if(kind==='sell'){this.noise(.2,{frequency:700,to:200,volume:.04,pan});this.tone(420,.18,'sine',.02,0,260,pan);}
    else if(kind==='target'){this.tone(880,.05,'sine',.015,0,880,pan);this.tone(1320,.06,'sine',.012,.05,1320,pan);}
    else if(kind==='wave'){this.horn(98,1.8,.07);}
    else if(kind==='boss'){this.horn(65,2.6,.09);this.noise(2.4,{frequency:180,to:60,volume:.08,attack:.4});}
    else if(kind==='leak'){this.tone(120,.35,'sawtooth',.03,0,55);this.noise(.4,{frequency:700,to:120,volume:.08});}
    else if(kind==='clear'||kind==='won'){[330,440,550,660].forEach((f,i)=>this.tone(f,.4,'sine',.028,i*.12));}
    else if(kind==='lost'){[330,260,165].forEach((f,i)=>this.tone(f,.5,'triangle',.03,i*.2));this.noise(2,{frequency:300,to:60,volume:.05,attack:.3});}
    else if(kind==='overdrive'){this.tone(165,.7,'sine',.05,0,660);this.tone(82,.9,'triangle',.03,0,330);}
    else if(kind==='strike'){this.tone(220,.85,'sine',.05,0,1400,pan);this.noise(.8,{type:'highpass',frequency:2500,to:7000,volume:.03,attack:.6,pan});}
    else if(kind==='strikeHit'){this.noise(1.2,{frequency:4000,to:100,volume:.18,pan});this.tone(55,1,'sine',.14,0,26,pan);this.noise(.5,{type:'highpass',frequency:6000,volume:.03,delay:.05,pan});}
    else if(kind==='thunder'){const v=.08+.1*gain;this.noise(2.8,{frequency:420,to:60,volume:v,delay,attack:.08,pan});this.noise(1.2,{frequency:1400,to:200,volume:v*.6,delay:delay+.02,pan});this.tone(40,2.2,'sine',v*.8,delay,28,pan);}
    else if(kind==='firework'){if(this.limited('firework',.2))return;this.noise(.12,{frequency:2500,to:400,volume:.05,pan});for(let i=0;i<5;i++)this.noise(.03,{type:'highpass',frequency:5000,volume:.012,delay:.15+i*.06+Math.random()*.04,pan});}
    else if(kind==='endless'){this.horn(82,2.2,.07);}
  }
}
