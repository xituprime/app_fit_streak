import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { CrunchCounter, type CrunchDebug, type CrunchFeedback } from './crunchCounter'
import { PushUpCounter, type Landmark, type PushUpDebug, type PushUpFeedback } from './pushUpCounter'

type Analysis<D, F> = { feedback: F; completedRep: boolean; debug: D }
type Counter<D, F> = { reset(): void; analyze(landmarks: Landmark[]): Analysis<D, F> }
export type ExerciseDetector<D, F> = { start(video: HTMLVideoElement): Promise<void>; stop(): void; onRep(callback: () => void): void; onFeedback(callback: (feedback: F) => void): void; onDebug(callback: (debug: D) => void): void; onPose(callback: (landmarks: Landmark[] | null) => void): void }

/** Shared MediaPipe/camera adapter. Exercise-specific state machines live in their own modules. */
const createPoseDetector = <D, F>(counter: Counter<D, F>): ExerciseDetector<D, F> => {
  let landmarker: PoseLandmarker | undefined, frameId = 0, lastVideoTime = -1
  let repCallback = () => {}, feedbackCallback: (feedback: F) => void = () => {}, debugCallback: (debug: D) => void = () => {}, poseCallback: (landmarks: Landmark[] | null) => void = () => {}
  const detect = (video: HTMLVideoElement) => {
    if (!landmarker) return
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime
      const pose = landmarker.detectForVideo(video, performance.now()).landmarks[0] as Landmark[] | undefined
      poseCallback(pose ?? null)
      const event = counter.analyze(pose ?? [])
      feedbackCallback(event.feedback); debugCallback(event.debug)
      if (event.completedRep) repCallback()
    }
    frameId = requestAnimationFrame(() => detect(video))
  }
  return {
    async start(video) {
      counter.reset(); lastVideoTime = -1
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm')
      landmarker = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 })
      detect(video)
    },
    stop() { cancelAnimationFrame(frameId); frameId = 0; landmarker?.close(); landmarker = undefined },
    onRep(callback) { repCallback = callback }, onFeedback(callback) { feedbackCallback = callback }, onDebug(callback) { debugCallback = callback }, onPose(callback) { poseCallback = callback }
  }
}
export const createPushUpDetector = () => createPoseDetector<PushUpDebug, PushUpFeedback>(new PushUpCounter())
export const createCrunchDetector = () => createPoseDetector<CrunchDebug, CrunchFeedback>(new CrunchCounter())
