export type Landmark = { x: number; y: number; z?: number; visibility?: number }
export type PushUpFeedback = 'Colócate de lado' | 'Mantén el cuerpo recto' | 'Baja más' | 'Sube' | 'Buena repetición'

type Side = { shoulder: Landmark; elbow: Landmark; wrist: Landmark; hip: Landmark; ankle: Landmark }

const angleAt = (a: Landmark, b: Landmark, c: Landmark) => {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y)
  return magnitude ? Math.acos(Math.max(-1, Math.min(1, dot / magnitude))) * 180 / Math.PI : 0
}

const bodyAngle = (shoulder: Landmark, hip: Landmark) => {
  const degrees = Math.abs(Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x) * 180 / Math.PI)
  return Math.min(degrees, 180 - degrees)
}

/** Exercise-only state machine. It has no dependency on MediaPipe. */
export class PushUpCounter {
  private phase: 'UP' | 'DOWN' = 'UP'
  private lastRepAt = 0

  reset() { this.phase = 'UP'; this.lastRepAt = 0 }

  analyze(landmarks: Landmark[]): { feedback: PushUpFeedback; completedRep: boolean } {
    // MediaPipe Pose landmark positions: shoulders 11/12, elbows 13/14, wrists 15/16,
    // hips 23/24, ankles 27/28. Choose the side more visible to the camera.
    const sides: Side[] = [
      { shoulder: landmarks[11], elbow: landmarks[13], wrist: landmarks[15], hip: landmarks[23], ankle: landmarks[27] },
      { shoulder: landmarks[12], elbow: landmarks[14], wrist: landmarks[16], hip: landmarks[24], ankle: landmarks[28] }
    ].filter((side): side is Side => Object.values(side).every(Boolean))
    if (!sides.length) return { feedback: 'Colócate de lado', completedRep: false }
    const side = sides.sort((a, b) => ([b.shoulder, b.elbow, b.wrist, b.hip].reduce((n, p) => n + (p.visibility ?? 1), 0)) - ([a.shoulder, a.elbow, a.wrist, a.hip].reduce((n, p) => n + (p.visibility ?? 1), 0)))[0]
    if ((side.shoulder.visibility ?? 1) < .45 || (side.elbow.visibility ?? 1) < .45 || (side.wrist.visibility ?? 1) < .45) return { feedback: 'Colócate de lado', completedRep: false }
    if (bodyAngle(side.shoulder, side.hip) > 45) return { feedback: 'Mantén el cuerpo recto', completedRep: false }

    const elbowAngle = angleAt(side.shoulder, side.elbow, side.wrist)
    if (elbowAngle <= 105) { this.phase = 'DOWN'; return { feedback: 'Sube', completedRep: false } }
    if (elbowAngle < 160) return { feedback: this.phase === 'DOWN' ? 'Sube' : 'Baja más', completedRep: false }
    if (this.phase === 'DOWN' && (this.lastRepAt === 0 || performance.now() - this.lastRepAt > 450)) {
      this.phase = 'UP'; this.lastRepAt = performance.now()
      return { feedback: 'Buena repetición', completedRep: true }
    }
    return { feedback: 'Baja más', completedRep: false }
  }
}
