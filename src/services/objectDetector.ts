import { FilesetResolver, ObjectDetector as MediaPipeObjectDetector } from '@mediapipe/tasks-vision';

export interface DetectedObject {
  label: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

let objectDetectorInstance: MediaPipeObjectDetector | null = null;
let isInitializing = false;

const WASM_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const OBJECT_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

export async function getMediaPipeObjectDetector(): Promise<MediaPipeObjectDetector | null> {
  if (objectDetectorInstance) return objectDetectorInstance;
  if (isInitializing) {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (objectDetectorInstance) return objectDetectorInstance;
    }
  }

  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
    objectDetectorInstance = await MediaPipeObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: OBJECT_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      scoreThreshold: 0.35,
      maxResults: 10,
    });
    return objectDetectorInstance;
  } catch (err) {
    console.warn('GPU delegate failed for ObjectDetector, falling back to CPU:', err);
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
      objectDetectorInstance = await MediaPipeObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: OBJECT_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        scoreThreshold: 0.35,
        maxResults: 10,
      });
      return objectDetectorInstance;
    } catch (cpuErr) {
      console.error('Failed to initialize MediaPipe ObjectDetector:', cpuErr);
      return null;
    }
  } finally {
    isInitializing = false;
  }
}

export async function detectObjects(
  imageSource: HTMLImageElement | HTMLCanvasElement
): Promise<DetectedObject[]> {
  const results: DetectedObject[] = [];
  try {
    const detector = await getMediaPipeObjectDetector();
    if (!detector) return results;

    const detections = detector.detect(imageSource);
    if (detections && detections.detections) {
      for (const det of detections.detections) {
        const bb = det.boundingBox;
        if (!bb) continue;

        const category = det.categories?.[0];
        results.push({
          label: category?.categoryName || 'object',
          confidence: category?.score ?? 0.8,
          boundingBox: {
            x: bb.originX,
            y: bb.originY,
            width: bb.width,
            height: bb.height,
          },
        });
      }
    }
  } catch (err) {
    console.error('Object detection error:', err);
  }
  return results;
}
