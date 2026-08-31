export type Landmark = { x: number; y: number; z?: number; visibility?: number }
export type PushUpFeedback = 'Colócate dentro de la guía' | 'Posición detectada ✓' | 'Vuelve a colocarte en posición' | 'Baja más' | 'Sube' | 'Buena repetición'
export type PushUpState = 'UP' | 'DESCENDING' | 'DOWN' | 'ASCENDING'
export type PushUpMode = 'SETUP' | 'READY'
export type PushUpDebug = { mode: PushUpMode; state: PushUpState; elbowAngle: number | null; visibility: number; reps: number }

type Side = { shoulder: Landmark; elbow: Landmark; wrist: Landmark; hip: Landmark; knee: Landmark; ankle: Landmark }
type Analysis = { feedback: PushUpFeedback; completedRep: boolean; debug: PushUpDebug }
const DOWN_ENTER = 100, DOWN_EXIT = 122, UP_EXIT = 150, UP_ENTER = 165
const CONFIRM_FRAMES = 4, MIN_REP_MS = 850, MIN_VISIBILITY = .55, EMA_ALPHA = .32, MAX_FRAME_ANGLE_JUMP = 55
const SETUP_HOLD_MS = 900, LOST_POSE_FRAMES = 8, MAX_BODY_ANGLE = 28, MAX_LINE_DEVIATION = .12

const angleAt = (a: Landmark, b: Landmark, c: Landmark) => {
  const ab = { x: a.x - b.x, y: a.y - b.y }, cb = { x: c.x - b.x, y: c.y - b.y }
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y)
  return magnitude ? Math.acos(Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / magnitude))) * 180 / Math.PI : 0
}
const horizontalAngle = (a: Landmark, b: Landmark) => Math.min(Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI), 180 - Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI))
const distanceToLine = (point: Landmark, start: Landmark, end: Landmark) => {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  return length ? Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y)) / length : Infinity
}

/** Exercise domain logic. MediaPipe only supplies generic landmarks to this class. */
export class PushUpCounter {
  private mode: PushUpMode = 'SETUP'; private state: PushUpState = 'UP'
  private setupStartedAt: number | null = null; private invalidFrames = 0
  private upFrames = 0; private downFrames = 0; private initialUpConfirmed = false
  private smoothedAngle: number | null = null; private previousRawAngle: number | null = null
  private lastRepAt = 0; private totalReps = 0

  reset() { this.mode = 'SETUP'; this.state = 'UP'; this.setupStartedAt = null; this.invalidFrames = 0; this.upFrames = 0; this.downFrames = 0; this.initialUpConfirmed = false; this.smoothedAngle = null; this.previousRawAngle = null; this.lastRepAt = 0; this.totalReps = 0 }
  private debug(visibility: number): PushUpDebug { return { mode: this.mode, state: this.state, elbowAngle: this.smoothedAngle === null ? null : Math.round(this.smoothedAngle), visibility: Math.round(visibility * 100), reps: this.totalReps } }
  private setup(feedback: PushUpFeedback, visibility: number): Analysis { return { feedback, completedRep: false, debug: this.debug(visibility) } }
  private resetToSetup() { this.mode = 'SETUP'; this.state = 'UP'; this.setupStartedAt = null; this.invalidFrames = 0; this.upFrames = 0; this.downFrames = 0; this.initialUpConfirmed = false; this.smoothedAngle = null; this.previousRawAngle = null }

  analyze(landmarks: Landmark[]): Analysis {
    const sides: Side[] = [
      { shoulder: landmarks[11], elbow: landmarks[13], wrist: landmarks[15], hip: landmarks[23], knee: landmarks[25], ankle: landmarks[27] },
      { shoulder: landmarks[12], elbow: landmarks[14], wrist: landmarks[16], hip: landmarks[24], knee: landmarks[26], ankle: landmarks[28] }
    ].filter((side): side is Side => Object.values(side).every(Boolean))
    if (!sides.length) return this.handleInvalidPose(0)
    const score = (side: Side) => Object.values(side).reduce((sum, point) => sum + (point.visibility ?? 0), 0) / 6
    const side = sides.sort((a, b) => score(b) - score(a))[0], visibility = score(side)
    const validSide = visibility >= MIN_VISIBILITY
    // Side-view heuristic: left/right shoulders and hips should substantially overlap on the screen.
    const profile = landmarks[11] && landmarks[12] && landmarks[23] && landmarks[24]
      ? Math.abs(landmarks[11].x - landmarks[12].x) < .20 && Math.abs(landmarks[23].x - landmarks[24].x) < .20 : true
    const lineLength = Math.hypot(side.ankle.x - side.shoulder.x, side.ankle.y - side.shoulder.y)
    const aligned = lineLength > .24 && horizontalAngle(side.shoulder, side.hip) <= MAX_BODY_ANGLE && horizontalAngle(side.hip, side.ankle) <= MAX_BODY_ANGLE && distanceToLine(side.hip, side.shoulder, side.ankle) <= MAX_LINE_DEVIATION && distanceToLine(side.knee, side.shoulder, side.ankle) <= MAX_LINE_DEVIATION
    if (!validSide || !profile || !aligned) return this.handleInvalidPose(visibility)
    this.invalidFrames = 0

    if (this.mode === 'SETUP') {
      this.setupStartedAt ??= performance.now()
      if (performance.now() - this.setupStartedAt < SETUP_HOLD_MS) return this.setup('Colócate dentro de la guía', visibility)
      this.mode = 'READY'; this.state = 'UP'; this.initialUpConfirmed = false; this.upFrames = 0; this.downFrames = 0
      return this.setup('Posición detectada ✓', visibility)
    }

    const rawAngle = angleAt(side.shoulder, side.elbow, side.wrist)
    if (this.previousRawAngle !== null && Math.abs(rawAngle - this.previousRawAngle) > MAX_FRAME_ANGLE_JUMP) return this.handleInvalidPose(visibility)
    this.previousRawAngle = rawAngle
    this.smoothedAngle = this.smoothedAngle === null ? rawAngle : EMA_ALPHA * rawAngle + (1 - EMA_ALPHA) * this.smoothedAngle
    const angle = this.smoothedAngle, isUp = angle >= UP_ENTER, isDown = angle <= DOWN_ENTER
    if (isUp) { this.upFrames++; this.downFrames = 0 } else if (isDown) { this.downFrames++; this.upFrames = 0 } else { this.upFrames = 0; this.downFrames = 0 }

    let feedback: PushUpFeedback = 'Baja más', completedRep = false
    switch (this.state) {
      case 'UP':
        if (this.upFrames >= CONFIRM_FRAMES) { this.initialUpConfirmed = true; feedback = 'Baja más' }
        else if (this.initialUpConfirmed && angle < UP_EXIT && this.upFrames === 0) this.state = 'DESCENDING'
        break
      case 'DESCENDING':
        if (this.downFrames >= CONFIRM_FRAMES) { this.state = 'DOWN'; feedback = 'Sube' }
        else if (this.upFrames >= CONFIRM_FRAMES) this.state = 'UP'
        break
      case 'DOWN':
        feedback = 'Sube'
        // Holding the low position remains DOWN and can never emit a repetition.
        if (angle >= DOWN_EXIT) { this.state = 'ASCENDING'; this.upFrames = 0 }
        break
      case 'ASCENDING':
        feedback = 'Sube'
        if (this.downFrames >= CONFIRM_FRAMES) this.state = 'DOWN'
        else if (this.upFrames >= CONFIRM_FRAMES) { this.state = 'UP'; if (this.lastRepAt === 0 || performance.now() - this.lastRepAt >= MIN_REP_MS) { this.lastRepAt = performance.now(); this.totalReps++; completedRep = true; feedback = 'Buena repetición' } }
        break
    }
    return { feedback, completedRep, debug: this.debug(visibility) }
  }

  private handleInvalidPose(visibility: number): Analysis {
    this.setupStartedAt = null; this.upFrames = 0; this.downFrames = 0; this.previousRawAngle = null
    if (this.mode === 'SETUP') return this.setup('Colócate dentro de la guía', visibility)
    this.invalidFrames++
    if (this.invalidFrames >= LOST_POSE_FRAMES) { this.resetToSetup(); return this.setup('Vuelve a colocarte en posición', visibility) }
    return this.setup('Vuelve a colocarte en posición', visibility)
  }
}
