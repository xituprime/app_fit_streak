import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { PushUpCounter, type PushUpFeedback } from './pushUpCounter'

export type ExerciseDetector = {
  start(video: HTMLVideoElement): Promise<void>
  stop(): void
  onRep(callback: () => void): void
  onFeedback(callback: (feedback: PushUpFeedback) => void): void
}

/** MediaPipe adapter. Video frames stay in the browser; only model/WASM assets are fetched. */
export const createPushUpDetector = (): ExerciseDetector => {
  let landmarker: PoseLandmarker | undefined
  let frameId = 0
  let lastVideoTime = -1
  let repCallback = () => {}
  let feedbackCallback: (feedback: PushUpFeedback) => void = () => {}
  const counter = new PushUpCounter()

  const detect = (video: HTMLVideoElement) => {
    if (!landmarker) return
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime
      const result = landmarker.detectForVideo(video, performance.now())
      const pose = result.landmarks[0]
      if (pose) {
        const event = counter.analyze(pose)
        feedbackCallback(event.feedback)
        if (event.completedRep) repCallback()
      } else feedbackCallback('Colócate de lado')
    }
    frameId = requestAnimationFrame(() => detect(video))
  }

  return {
    async start(video) {
      counter.reset(); lastVideoTime = -1
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm')
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1
      })
      detect(video)
    },
    stop() { cancelAnimationFrame(frameId); frameId = 0; landmarker?.close(); landmarker = undefined },
    onRep(callback) { repCallback = callback },
    onFeedback(callback) { feedbackCallback = callback }
  }
}
