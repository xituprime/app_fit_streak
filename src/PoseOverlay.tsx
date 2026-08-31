import { useEffect, useRef } from 'react'
import type { Landmark } from './pushUpCounter'

const connections = [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]]

export default function PoseOverlay({ landmarks, mirrored }: { landmarks: Landmark[] | null; mirrored: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')!
    const draw = () => {
      const rect = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, rect.width, rect.height)
      if (!landmarks) return
      // This canvas mirrors only visually alongside the video; MediaPipe receives unchanged pixels.
      context.strokeStyle = '#98f55a'; context.fillStyle = '#e9ffdb'; context.lineWidth = 2
      const point = (landmark: Landmark) => ({ x: landmark.x * rect.width, y: landmark.y * rect.height })
      for (const [a, b] of connections) { const first = landmarks[a], second = landmarks[b]; if (first && second && (first.visibility ?? 0) > .35 && (second.visibility ?? 0) > .35) { const p1 = point(first), p2 = point(second); context.beginPath(); context.moveTo(p1.x,p1.y); context.lineTo(p2.x,p2.y); context.stroke() } }
      for (const landmark of landmarks) if ((landmark.visibility ?? 0) > .35) { const p = point(landmark); context.beginPath(); context.arc(p.x,p.y,3,0,Math.PI*2); context.fill() }
    }
    draw()
  }, [landmarks])
  return <canvas ref={canvasRef} className={`pose-overlay${mirrored ? ' mirrored' : ''}`} aria-hidden="true" />
}
