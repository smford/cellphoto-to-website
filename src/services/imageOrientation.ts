import exifr from 'exifr';

function createOffscreenCanvas(width = 0, height = 0): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    if (width > 0) canvas.width = width;
    if (height > 0) canvas.height = height;
    return canvas;
  }
  return {
    width,
    height,
    getContext: () => ({
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
    }),
  } as unknown as HTMLCanvasElement;
}

/**
 * Extracts EXIF orientation (1..8) from an image Blob, File, or base64 data URL.
 * Defaults to 1 (normal orientation) if no tag is present.
 */
export async function getExifOrientation(input: Blob | File | string): Promise<number> {
  try {
    const orientation = await exifr.orientation(input);
    return typeof orientation === 'number' && orientation >= 1 && orientation <= 8
      ? orientation
      : 1;
  } catch {
    return 1;
  }
}

/**
 * Renders an image onto a canvas rotated according to EXIF Orientation 1..8.
 */
export function renderOrientedImage(
  sourceImage: HTMLImageElement | ImageBitmap,
  orientation = 1
): HTMLCanvasElement {
  const srcW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const srcH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  const canvas = orientation >= 5 && orientation <= 8
    ? createOffscreenCanvas(srcH, srcW)
    : createOffscreenCanvas(srcW, srcH);

  const ctx = canvas.getContext('2d')!;

  switch (orientation) {
    case 2:
      // Horizontal flip
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      // 180° rotation
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      // Vertical flip
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
      break;
    case 5:
      // Vertical flip + 90° CCW
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      // 90° CW rotation (standard smartphone portrait)
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -canvas.width);
      break;
    case 7:
      // Horizontal flip + 90° CW
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(canvas.height, -canvas.width);
      ctx.scale(-1, 1);
      break;
    case 8:
      // 270° CW (90° CCW) rotation
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-canvas.height, 0);
      break;
    default:
      // 1: Normal (no transform)
      break;
  }

  ctx.drawImage(sourceImage, 0, 0);
  ctx.restore();

  return canvas;
}

/**
 * Manually rotates a canvas by 90° clockwise or counter-clockwise.
 */
export function rotateCanvas(
  sourceCanvas: HTMLCanvasElement,
  direction: 'cw' | 'ccw' | '180'
): HTMLCanvasElement {
  const is180 = direction === '180';
  const outW = is180 ? sourceCanvas.width : sourceCanvas.height;
  const outH = is180 ? sourceCanvas.height : sourceCanvas.width;

  const output = createOffscreenCanvas(outW, outH);
  const ctx = output.getContext('2d')!;

  if (is180) {
    ctx.translate(output.width, output.height);
    ctx.rotate(Math.PI);
  } else {
    if (direction === 'cw') {
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -output.width);
    } else {
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-output.height, 0);
    }
  }

  ctx.drawImage(sourceCanvas, 0, 0);
  return output;
}
