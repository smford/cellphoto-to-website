import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

let segmenterInstance: ImageSegmenter | null = null;
let isInitializing = false;

const WASM_CDN_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const SELFIE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

export async function getMediaPipeSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenterInstance) return segmenterInstance;
  if (isInitializing) {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (segmenterInstance) return segmenterInstance;
    }
  }

  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
    segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: SELFIE_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    });
    return segmenterInstance;
  } catch (err) {
    console.warn('GPU delegate failed for ImageSegmenter, falling back to CPU:', err);
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN_URL);
      segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: SELFIE_MODEL_URL,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      });
      return segmenterInstance;
    } catch (cpuErr) {
      console.error('Failed to initialize MediaPipe ImageSegmenter:', cpuErr);
      return null;
    }
  } finally {
    isInitializing = false;
  }
}

export type BackgroundRemovalMode = 'transparent' | 'white' | 'charcoal' | 'blur' | 'neon_blue';

/**
 * Removes or replaces the background of an image using MediaPipe segmentation.
 */
export async function removeBackground(
  sourceCanvas: HTMLCanvasElement,
  mode: BackgroundRemovalMode = 'transparent'
): Promise<HTMLCanvasElement> {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outCtx = outputCanvas.getContext('2d')!;

  const srcCtx = sourceCanvas.getContext('2d')!;
  const srcImgData = srcCtx.getImageData(0, 0, width, height);
  const srcData = srcImgData.data;

  try {
    const segmenter = await getMediaPipeSegmenter();
    if (segmenter) {
      const result = segmenter.segment(sourceCanvas);

      let maskData: Float32Array | Uint8Array | null = null;
      let maskWidth = width;
      let maskHeight = height;

      if (result.confidenceMasks && result.confidenceMasks.length > 0) {
        maskData = result.confidenceMasks[0].getAsFloat32Array();
        maskWidth = result.confidenceMasks[0].width;
        maskHeight = result.confidenceMasks[0].height;
      } else if (result.categoryMask) {
        maskData = result.categoryMask.getAsUint8Array();
        maskWidth = result.categoryMask.width;
        maskHeight = result.categoryMask.height;
      }

      if (maskData) {
        const outImgData = outCtx.createImageData(width, height);
        const outData = outImgData.data;

        const scaleX = maskWidth / width;
        const scaleY = maskHeight / height;

        // Background color specs for solid replacements
        const bgColors: Record<BackgroundRemovalMode, [number, number, number, number]> = {
          transparent: [0, 0, 0, 0],
          white: [255, 255, 255, 255],
          charcoal: [26, 32, 44, 255],
          neon_blue: [37, 99, 235, 255],
          blur: [0, 0, 0, 0],
        };

        const [br, bg, bb, ba] = bgColors[mode];

        for (let y = 0; y < height; y++) {
          const my = Math.min(maskHeight - 1, Math.floor(y * scaleY));
          const rowOffset = y * width;
          const maskRowOffset = my * maskWidth;

          for (let x = 0; x < width; x++) {
            const mx = Math.min(maskWidth - 1, Math.floor(x * scaleX));
            const maskIdx = maskRowOffset + mx;
            const pixelIdx = (rowOffset + x) * 4;

            // In confidence masks, foreground (person) is typically closer to 1.0
            const confidence = maskData[maskIdx];
            const isForeground = confidence > 0.45;

            if (isForeground) {
              // Smooth edge feathering
              const alphaRatio = Math.min(1, Math.max(0, (confidence - 0.25) / 0.5));
              outData[pixelIdx] = srcData[pixelIdx];
              outData[pixelIdx + 1] = srcData[pixelIdx + 1];
              outData[pixelIdx + 2] = srcData[pixelIdx + 2];
              outData[pixelIdx + 3] = Math.round(srcData[pixelIdx + 3] * alphaRatio);
            } else {
              outData[pixelIdx] = br;
              outData[pixelIdx + 1] = bg;
              outData[pixelIdx + 2] = bb;
              outData[pixelIdx + 3] = ba;
            }
          }
        }

        outCtx.putImageData(outImgData, 0, 0);
        return outputCanvas;
      }
    }
  } catch (err) {
    console.warn('MediaPipe segmentation error, applying fallback background remover:', err);
  }

  // Fallback: Color variance / Edge-based background removal heuristic
  return applyHeuristicBackgroundRemoval(sourceCanvas, mode);
}

/**
 * Heuristic fallback for background removal based on outer border color clustering.
 */
function applyHeuristicBackgroundRemoval(
  sourceCanvas: HTMLCanvasElement,
  mode: BackgroundRemovalMode
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outCtx = outputCanvas.getContext('2d')!;

  const srcCtx = sourceCanvas.getContext('2d')!;
  const imgData = srcCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Sample corner background colors
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  let bgR = 0, bgG = 0, bgB = 0;
  corners.forEach(([cx, cy]) => {
    const idx = (cy * width + cx) * 4;
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  });
  bgR /= 4;
  bgG /= 4;
  bgB /= 4;

  const bgColors: Record<BackgroundRemovalMode, [number, number, number, number]> = {
    transparent: [0, 0, 0, 0],
    white: [255, 255, 255, 255],
    charcoal: [26, 32, 44, 255],
    neon_blue: [37, 99, 235, 255],
    blur: [0, 0, 0, 0],
  };
  const [br, bg, bb, ba] = bgColors[mode];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
    if (dist < 45) {
      data[i] = br;
      data[i + 1] = bg;
      data[i + 2] = bb;
      data[i + 3] = ba;
    }
  }

  outCtx.putImageData(imgData, 0, 0);
  return outputCanvas;
}
