// Original synthesized sound effects. No samples, downloads, or audio permissions.
export class AudioEngine {
  constructor(){this.enabled=false;this.ctx=null;this.lastShot=0;}
  async toggle(){
    if(!this.ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;this.ctx=new Audio();}
    if(this.ctx.state==='suspended')await this.ctx.resume();
    this.enabled=!this.enabled;if(this.enabled)this.play('build');return this.enabled;
  }
  tone(freq,duration=.12,type='sine',volume=.035,delay=0,endFreq=freq){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const at=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(this.ctx.destination);osc.start(at);osc.stop(at+duration+.02);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  play(kind){
    if(!this.enabled||!this.ctx)return;
    if(kind==='shoot') {if(this.ctx.currentTime-this.lastShot<.065)return;this.lastShot=this.ctx.currentTime;this.tone(200,.055,'triangle',.018,0,85);}
    else if(kind==='blast')this.tone(75,.2,'triangle',.034,0,32);
    else if(kind==='build'||kind==='upgrade'||kind==='grid'){this.tone(520,.14,'sine',.03);this.tone(780,.22,'sine',.025,.09);}
    else if(kind==='wave'||kind==='boss'){this.tone(220,.35,'triangle',.035);this.tone(165,.5,'triangle',.035,.2);}
    else if(kind==='leak'){this.tone(110,.3,'sawtooth',.014,0,60);}
    else if(kind==='clear'||kind==='won'){[330,440,550,660].forEach((f,i)=>this.tone(f,.4,'sine',.028,i*.12));}
    else if(kind==='lost'){[330,260,165].forEach((f,i)=>this.tone(f,.5,'triangle',.03,i*.2));}
    else if(kind==='overdrive'){this.tone(165,.7,'sine',.05,0,660);}
  }
}
