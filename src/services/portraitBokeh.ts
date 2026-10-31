import type { DetectedFace } from './imageFilters';

/**
 * Applies a portrait depth-of-field bokeh blur, keeping detected faces crisp
 * while smoothly blurring the background.
 */
export function applyPortraitBokeh(
  sourceCanvas: HTMLCanvasElement,
  faces: DetectedFace[],
  blurRadius = 12
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outCtx = outputCanvas.getContext('2d')!;

  // 1. Draw blurred version of original image
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext('2d')!;
  blurCtx.filter = `blur(${blurRadius}px)`;
  blurCtx.drawImage(sourceCanvas, 0, 0, width, height);

  outCtx.drawImage(blurCanvas, 0, 0);

  // 2. Create sharp subject layer with feathered radial gradient mask around each face
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d')!;

  const targets = faces.length > 0
    ? faces.map((f) => ({
        cx: f.boundingBox.x + f.boundingBox.width / 2,
        cy: f.boundingBox.y + f.boundingBox.height / 2,
        radius: Math.max(f.boundingBox.width, f.boundingBox.height) * 0.9,
      }))
    : [{ cx: width / 2, cy: height / 2, radius: Math.min(width, height) * 0.35 }];

  targets.forEach(({ cx, cy, radius }) => {
    const grad = maskCtx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.5);
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.8)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    maskCtx.fillStyle = grad;
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, radius * 1.6, 0, 2 * Math.PI);
    maskCtx.fill();
  });

  // 3. Composite sharp original over blurred background using the feathered mask
  const sharpLayerCanvas = document.createElement('canvas');
  sharpLayerCanvas.width = width;
  sharpLayerCanvas.height = height;
  const sharpCtx = sharpLayerCanvas.getContext('2d')!;

  sharpCtx.drawImage(sourceCanvas, 0, 0);
  sharpCtx.globalCompositeOperation = 'destination-in';
  sharpCtx.drawImage(maskCanvas, 0, 0);

  outCtx.drawImage(sharpLayerCanvas, 0, 0);

  return outputCanvas;
}
