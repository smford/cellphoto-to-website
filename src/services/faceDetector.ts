import { FilesetResolver, FaceDetector as MediaPipeFaceDetector } from '@mediapipe/tasks-vision';
import type { DetectedFace } from './imageFilters';

let mediaPipeDetectorInstance: MediaPipeFaceDetector | null = null;
let isInitializing = false;

// MediaPipe Wasm & Model URLs
const WASM_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

/**
 * Lazy-loads MediaPipe FaceDetector
 */
export async function getMediaPipeFaceDetector(): Promise<MediaPipeFaceDetector | null> {
  if (mediaPipeDetectorInstance) return mediaPipeDetectorInstance;
  if (isInitializing) {
    // Wait until initialized
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (mediaPipeDetectorInstance) return mediaPipeDetectorInstance;
    }
  }

  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
    mediaPipeDetectorInstance = await MediaPipeFaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.45,
    });
    return mediaPipeDetectorInstance;
  } catch (err) {
    console.warn('GPU delegate failed for MediaPipe FaceDetector, falling back to CPU:', err);
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
      mediaPipeDetectorInstance = await MediaPipeFaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.45,
      });
      return mediaPipeDetectorInstance;
    } catch (cpuErr) {
      console.error('Failed to initialize MediaPipe FaceDetector:', cpuErr);
      return null;
    }
  } finally {
    isInitializing = false;
  }
}

/**
 * Runs face detection on an HTMLImageElement or HTMLCanvasElement.
 * Uses Shape Detection API (window.FaceDetector) or MediaPipe Face Detector.
 */
export async function detectFaces(imageSource: HTMLImageElement | HTMLCanvasElement): Promise<DetectedFace[]> {
  const faces: DetectedFace[] = [];

  // 1. Try Native FaceDetector API if available
  if ('FaceDetector' in window) {
    try {
      // @ts-expect-error Native Shape Detection API
      const nativeDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      const rawFaces = await nativeDetector.detect(imageSource);
      if (rawFaces && rawFaces.length > 0) {
        for (const rf of rawFaces) {
          const landmarks: DetectedFace['landmarks'] = [];
          if (rf.landmarks) {
            for (const lm of rf.landmarks) {
              for (const loc of lm.locations || []) {
                landmarks.push({
                  type: lm.type === 'eye' ? 'eye' : lm.type === 'mouth' ? 'mouth' : lm.type === 'nose' ? 'nose' : 'ear',
                  x: loc.x,
                  y: loc.y,
                });
              }
            }
          }
          faces.push({
            boundingBox: {
              x: rf.boundingBox.x,
              y: rf.boundingBox.y,
              width: rf.boundingBox.width,
              height: rf.boundingBox.height,
            },
            confidence: 0.95,
            landmarks: landmarks.length > 0 ? landmarks : undefined,
          });
        }
        return faces;
      }
    } catch (e) {
      console.warn('Native FaceDetector error, trying MediaPipe:', e);
    }
  }

  // 2. Try MediaPipe FaceDetector
  try {
    const mp = await getMediaPipeFaceDetector();
    if (mp) {
      const result = mp.detect(imageSource);
      if (result && result.detections) {
        for (const det of result.detections) {
          const bb = det.boundingBox;
          if (!bb) continue;

          const landmarks: DetectedFace['landmarks'] = [];
          if (det.keypoints) {
            det.keypoints.forEach((kp, idx) => {
              // 0: right eye, 1: left eye, 2: nose tip, 3: mouth center, 4: right ear tragion, 5: left ear tragion
              let type: 'eye' | 'nose' | 'mouth' | 'ear' = 'eye';
              if (idx === 2) type = 'nose';
              else if (idx === 3) type = 'mouth';
              else if (idx >= 4) type = 'ear';

              const imgW = 'naturalWidth' in imageSource ? imageSource.naturalWidth : imageSource.width;
              const imgH = 'naturalHeight' in imageSource ? imageSource.naturalHeight : imageSource.height;

              landmarks.push({
                type,
                x: kp.x * imgW,
                y: kp.y * imgH,
              });
            });
          }

          faces.push({
            boundingBox: {
              x: bb.originX,
              y: bb.originY,
              width: bb.width,
              height: bb.height,
            },
            confidence: det.categories?.[0]?.score ?? 0.9,
            landmarks,
          });
        }
      }
    }
  } catch (mpErr) {
    console.error('MediaPipe detection failed:', mpErr);
  }

  return faces;
}
