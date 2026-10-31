import jsQR from 'jsqr';

export interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cornerPoints?: { x: number; y: number }[];
}

/**
 * Detects barcodes and QR codes from an image source
 */
export async function detectBarcodes(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): Promise<DetectedBarcode[]> {
  const results: DetectedBarcode[] = [];

  // 1. Try Native BarcodeDetector API if available
  if ('BarcodeDetector' in window) {
    try {
      // @ts-expect-error Native BarcodeDetector API
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
      // @ts-expect-error Native BarcodeDetector API
      const barcodeDetector = new window.BarcodeDetector({ formats: supportedFormats });
      const detected = await barcodeDetector.detect(canvas);

      for (const item of detected) {
        results.push({
          rawValue: item.rawValue,
          format: item.format,
          boundingBox: item.boundingBox,
          cornerPoints: item.cornerPoints,
        });
      }

      if (results.length > 0) {
        return results;
      }
    } catch (e) {
      console.warn('Native BarcodeDetector error, falling back to jsQR:', e);
    }
  }

  // 2. Fallback to jsQR for QR Codes
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, canvas.width, canvas.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code) {
      const minX = Math.min(code.location.topLeftCorner.x, code.location.bottomLeftCorner.x);
      const maxX = Math.max(code.location.topRightCorner.x, code.location.bottomRightCorner.x);
      const minY = Math.min(code.location.topLeftCorner.y, code.location.topRightCorner.y);
      const maxY = Math.max(code.location.bottomLeftCorner.y, code.location.bottomRightCorner.y);

      results.push({
        rawValue: code.data,
        format: 'qr_code',
        boundingBox: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        },
        cornerPoints: [
          code.location.topLeftCorner,
          code.location.topRightCorner,
          code.location.bottomRightCorner,
          code.location.bottomLeftCorner,
        ],
      });
    }
  } catch (err) {
    console.error('jsQR failed:', err);
  }

  return results;
}
