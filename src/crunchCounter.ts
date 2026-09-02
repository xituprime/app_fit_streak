import type { Landmark } from './pushUpCounter'

export type CrunchFeedback = 'Colócate dentro de la guía' | 'Posición detectada ✓' | 'Vuelve a colocarte en posición' | 'Sube el torso' | 'Baja controlado' | 'Buena repetición'
export type CrunchDebug = { mode: 'SETUP' | 'READY'; state: 'DOWN' | 'UP'; torsoAngle: number | null; visibility: number; reps: number }
type Result = { feedback: CrunchFeedback; completedRep: boolean; debug: CrunchDebug }
const VISIBILITY = .55, HOLD_MS = 900, CONFIRM = 4
const angleAt = (a: Landmark,b: Landmark,c: Landmark) => { const ab={x:a.x-b.x,y:a.y-b.y},cb={x:c.x-b.x,y:c.y-b.y}; const m=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y); return m?Math.acos(Math.max(-1,Math.min(1,(ab.x*cb.x+ab.y*cb.y)/m)))*180/Math.PI:0 }

/** Independent crunch state machine: torso/hip movement is required; leg movement alone is ignored. */
export class CrunchCounter {
  private mode: 'SETUP'|'READY' = 'SETUP'; private state: 'DOWN'|'UP' = 'DOWN'; private setupAt: number|null = null
  private upFrames=0; private downFrames=0; private smoothed:number|null=null; private reps=0; private invalid=0
  reset(){this.mode='SETUP';this.state='DOWN';this.setupAt=null;this.upFrames=0;this.downFrames=0;this.smoothed=null;this.reps=0;this.invalid=0}
  private debug(v:number):CrunchDebug{return{mode:this.mode,state:this.state,torsoAngle:this.smoothed===null?null:Math.round(this.smoothed),visibility:Math.round(v*100),reps:this.reps}}
  analyze(l: Landmark[]):Result{
    // Side selected by visibility: shoulder, hip, knee, ankle. Knee angle validates flexed legs.
    const candidates=[[11,23,25,27],[12,24,26,28]].map(ids=>ids.map(i=>l[i]))
    const side=candidates.filter(points=>points.every(Boolean)).sort((a,b)=>b.reduce((s,p)=>s+(p.visibility??0),0)-a.reduce((s,p)=>s+(p.visibility??0),0))[0]
    if(!side) return this.invalidPose(0)
    const [shoulder,hip,knee,ankle]=side, visibility=side.reduce((s,p)=>s+(p.visibility??0),0)/4
    const kneeAngle=angleAt(hip,knee,ankle), bodySpan=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y)
    // Lying profile: torso low/horizontal, knees clearly flexed, and a meaningful torso segment.
    const torsoHorizontal=Math.abs(shoulder.y-hip.y)<.20 && bodySpan>.14
    if(visibility<VISIBILITY || kneeAngle>145 || !torsoHorizontal) return this.invalidPose(visibility)
    this.invalid=0
    if(this.mode==='SETUP'){this.setupAt??=performance.now();if(performance.now()-(this.setupAt??0)<HOLD_MS)return{feedback:'Colócate dentro de la guía',completedRep:false,debug:this.debug(visibility)};this.mode='READY';return{feedback:'Posición detectada ✓',completedRep:false,debug:this.debug(visibility)}}
    // Angle shoulder–hip–knee closes as the torso rises; EMA removes jitter.
    const raw=angleAt(shoulder,hip,knee);this.smoothed=this.smoothed===null?raw:.3*raw+.7*this.smoothed
    const up=this.smoothed<112, down=this.smoothed>142
    if(up){this.upFrames++;this.downFrames=0}else if(down){this.downFrames++;this.upFrames=0}else{this.upFrames=0;this.downFrames=0}
    let feedback:CrunchFeedback=this.state==='DOWN'?'Sube el torso':'Baja controlado',completedRep=false
    if(this.state==='DOWN'&&this.upFrames>=CONFIRM){this.state='UP';feedback='Baja controlado'}
    else if(this.state==='UP'&&this.downFrames>=CONFIRM){this.state='DOWN';this.reps++;completedRep=true;feedback='Buena repetición'}
    return{feedback,completedRep,debug:this.debug(visibility)}
  }
  private invalidPose(v:number):Result{this.setupAt=null;if(this.mode==='READY'&&++this.invalid>=8){this.mode='SETUP';this.state='DOWN';this.upFrames=0;this.downFrames=0;this.smoothed=null}return{feedback:this.mode==='READY'?'Vuelve a colocarte en posición':'Colócate dentro de la guía',completedRep:false,debug:this.debug(v)}}
}
