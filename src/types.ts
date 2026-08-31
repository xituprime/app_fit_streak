export type ExerciseDetector = {
  start(video: HTMLVideoElement): Promise<void>
  stop(): void
  onRep(callback: () => void): void
}

// Punto de extensión para MediaPipe / TensorFlow cuando se implemente la detección automática.
export const createExerciseDetector = (): ExerciseDetector => ({
  async start() {}, stop() {}, onRep() {}
})
