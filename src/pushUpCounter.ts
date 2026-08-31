export type Landmark = { x: number; y: number; z?: number; visibility?: number }
export type PushUpFeedback = 'Colócate de lado' | 'Mantén el cuerpo recto' | 'Baja más' | 'Sube' | 'Buena repetición'
export type PushUpState = 'UP' | 'DESCENDING' | 'DOWN' | 'ASCENDING'
export type PushUpDebug = { state: PushUpState; elbowAngle: number | null; visibility: number; reps: number }

type Side = { shoulder: Landmark; elbow: Landmark; wrist: Landmark; hip: Landmark }
type Analysis = { feedback: PushUpFeedback; completedRep: boolean; debug: PushUpDebug }

const DOWN_ENTER = 100, DOWN_EXIT = 122, UP_EXIT = 150, UP_ENTER = 165
const CONFIRM_FRAMES = 4, MIN_REP_MS = 850, MIN_VISIBILITY = .55, EMA_ALPHA = .32, MAX_FRAME_ANGLE_JUMP = 55

const angleAt = (a: Landmark, b: Landmark, c: Landmark) => {
  const ab = { x: a.x - b.x, y: a.y - b.y }, cb = { x: c.x - b.x, y: c.y - b.y }
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y)
  return magnitude ? Math.acos(Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / magnitude))) * 180 / Math.PI : 0
}
const bodyAngle = (shoulder: Landmark, hip: Landmark) => Math.min(Math.abs(Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x) * 180 / Math.PI), 180 - Math.abs(Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x) * 180 / Math.PI))

/** Exercise-only state machine; it intentionally knows nothing about MediaPipe. */
export class PushUpCounter {
  private state: PushUpState = 'UP'
  private upFrames = 0; private downFrames = 0
  private smoothedAngle: number | null = null; private previousRawAngle: number | null = null
  private lastRepAt = 0; private totalReps = 0
  private initialUpConfirmed = false

  reset() { this.state = 'UP'; this.upFrames = 0; this.downFrames = 0; this.smoothedAngle = null; this.previousRawAngle = null; this.lastRepAt = 0; this.totalReps = 0; this.initialUpConfirmed = false }
  private debug(visibility: number): PushUpDebug { return { state: this.state, elbowAngle: this.smoothedAngle === null ? null : Math.round(this.smoothedAngle), visibility: Math.round(visibility * 100), reps: this.totalReps } }
  private invalid(feedback: PushUpFeedback, visibility = 0): Analysis {
    // Missing/noisy data cannot move the state or create a repetition. Extremes must be reconfirmed.
    this.upFrames = 0; this.downFrames = 0; this.previousRawAngle = null
    return { feedback, completedRep: false, debug: this.debug(visibility) }
  }

  analyze(landmarks: Landmark[]): Analysis {
    const sides: Side[] = [
      { shoulder: landmarks[11], elbow: landmarks[13], wrist: landmarks[15], hip: landmarks[23] },
      { shoulder: landmarks[12], elbow: landmarks[14], wrist: landmarks[16], hip: landmarks[24] }
    ].filter((side): side is Side => Object.values(side).every(Boolean))
    if (!sides.length) return this.invalid('Colócate de lado')
    const score = (side: Side) => [side.shoulder, side.elbow, side.wrist, side.hip].reduce((sum, point) => sum + (point.visibility ?? 0), 0) / 4
    const side = sides.sort((a, b) => score(b) - score(a))[0], visibility = score(side)
    if (visibility < MIN_VISIBILITY) return this.invalid('Colócate de lado', visibility)
    if (bodyAngle(side.shoulder, side.hip) > 45) return this.invalid('Mantén el cuerpo recto', visibility)

    const rawAngle = angleAt(side.shoulder, side.elbow, side.wrist)
    if (this.previousRawAngle !== null && Math.abs(rawAngle - this.previousRawAngle) > MAX_FRAME_ANGLE_JUMP) return this.invalid('Colócate de lado', visibility)
    this.previousRawAngle = rawAngle
    this.smoothedAngle = this.smoothedAngle === null ? rawAngle : EMA_ALPHA * rawAngle + (1 - EMA_ALPHA) * this.smoothedAngle
    const angle = this.smoothedAngle, isUp = angle >= UP_ENTER, isDown = angle <= DOWN_ENTER
    if (isUp) { this.upFrames++; this.downFrames = 0 } else if (isDown) { this.downFrames++; this.upFrames = 0 } else { this.upFrames = 0; this.downFrames = 0 }

    let feedback: PushUpFeedback = 'Baja más', completedRep = false
    switch (this.state) {
      case 'UP':
        // Start only after stable UP. The UP → DESCENDING transition must be explicit.
        if (this.upFrames >= CONFIRM_FRAMES) { this.initialUpConfirmed = true; feedback = 'Baja más' }
        else if (this.initialUpConfirmed && angle < UP_EXIT && this.upFrames === 0) { this.state = 'DESCENDING'; feedback = 'Baja más' }
        break
      case 'DESCENDING':
        feedback = 'Baja más'
        if (this.downFrames >= CONFIRM_FRAMES) { this.state = 'DOWN'; feedback = 'Sube' }
        else if (this.upFrames >= CONFIRM_FRAMES) this.state = 'UP'
        break
      case 'DOWN':
        feedback = 'Sube'
        // Holding DOWN stays here: no count is possible from this state.
        if (angle >= DOWN_EXIT) { this.state = 'ASCENDING'; this.upFrames = 0 }
        break
      case 'ASCENDING':
        feedback = 'Sube'
        if (this.downFrames >= CONFIRM_FRAMES) { this.state = 'DOWN'; feedback = 'Sube' }
        else if (this.upFrames >= CONFIRM_FRAMES) {
          this.state = 'UP'
          if (this.lastRepAt === 0 || performance.now() - this.lastRepAt >= MIN_REP_MS) { this.lastRepAt = performance.now(); this.totalReps++; completedRep = true; feedback = 'Buena repetición' }
        }
        break
    }
    return { feedback, completedRep, debug: this.debug(visibility) }
  }
}
