import type { RawFace, RawPose } from './features'
import { faceFromBlendshapes, poseFromLandmarks } from './features'

// Google's MediaPipe models run in the browser (WebAssembly): the camera frames never leave the device.
// The code is bundled; the model files and the WebAssembly runtime are fetched once, only when a learner
// turns this on, so the classroom (offline) mode never downloads them.
const VERSION = '1.1.1'
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

export interface Vision {
  /** Reads one video frame. Either part is null when no face or no body is found. */
  read(video: HTMLVideoElement): { face: RawFace | null; pose: RawPose | null }
  close(): void
}

export async function loadVision(): Promise<Vision> {
  const { FilesetResolver, FaceLandmarker, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const files = await FilesetResolver.forVisionTasks(WASM)
  // The GPU is faster; many phones and all headless browsers need the CPU path instead.
  const either = async <T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>) => create('GPU').catch(() => create('CPU'))
  const face = await either((delegate) =>
    FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', outputFaceBlendshapes: true, numFaces: 1 }),
  )
  const pose = await either((delegate) => PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: POSE_MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 }))
  let last = 0 // detectForVideo wants strictly increasing timestamps
  return {
    read(video) {
      last = Math.max(Math.round(performance.now()), last + 1)
      const f = face.detectForVideo(video, last)
      const p = pose.detectForVideo(video, last)
      const shapes = f.faceBlendshapes?.[0]?.categories
      const lm = f.faceLandmarks?.[0]
      return {
        face: shapes && lm ? faceFromBlendshapes(shapes, lm) : null,
        pose: p.landmarks?.[0] ? poseFromLandmarks(p.landmarks[0]) : null,
      }
    },
    close() {
      face.close()
      pose.close()
    },
  }
}
