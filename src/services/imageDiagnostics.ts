export interface ImageDiagnosticsResult {
  sharpnessScore: number;
  sharpnessGrade: 'Crisp & Sharp' | 'Moderate Focus' | 'Soft / Motion Blurred';
  averageLuminance: number;
  exposureGrade: 'Well Exposed' | 'Under-Exposed (Dark)' | 'Over-Exposed (Blown)';
  contrastRatio: number;
  shadowClippingPct: number;
  highlightClippingPct: number;
  histogram: number[]; // 256 bins
}

/**
 * Calculates image sharpness using Laplacian variance and exposure distribution.
 */
export function analyzeImageQuality(imageData: ImageData): ImageDiagnosticsResult {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  // 1. Grayscale & Histogram
  const gray = new Float32Array(totalPixels);
  const histogram = new Array(256).fill(0);
  let totalLum = 0;
  let shadowCount = 0;
  let highlightCount = 0;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    gray[p] = lum;
    histogram[lum]++;
    totalLum += lum;

    if (lum < 10) shadowCount++;
    if (lum > 245) highlightCount++;
  }

  const avgLum = Math.round(totalLum / totalPixels);

  // 2. Laplacian Variance (Sharpness)
  // Convolution with 3x3 Laplacian kernel:
  // [ 0,  1,  0]
  // [ 1, -4,  1]
  // [ 0,  1,  0]
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      const lap =
        gray[idx - width] +
        gray[idx - 1] -
        4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + width];

      laplacianSum += lap;
      laplacianSqSum += lap * lap;
      count++;
    }
  }

  const meanLap = count > 0 ? laplacianSum / count : 0;
  const variance = count > 0 ? Math.round((laplacianSqSum / count) - (meanLap * meanLap)) : 0;

  let sharpnessGrade: ImageDiagnosticsResult['sharpnessGrade'] = 'Crisp & Sharp';
  if (variance < 100) {
    sharpnessGrade = 'Soft / Motion Blurred';
  } else if (variance < 400) {
    sharpnessGrade = 'Moderate Focus';
  }

  let exposureGrade: ImageDiagnosticsResult['exposureGrade'] = 'Well Exposed';
  if (avgLum < 65) {
    exposureGrade = 'Under-Exposed (Dark)';
  } else if (avgLum > 195) {
    exposureGrade = 'Over-Exposed (Blown)';
  }

  // Find min and max for dynamic range
  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < 256; i++) {
    if (histogram[i] > 0) {
      if (i < minLum) minLum = i;
      if (i > maxLum) maxLum = i;
    }
  }

  return {
    sharpnessScore: variance,
    sharpnessGrade,
    averageLuminance: avgLum,
    exposureGrade,
    contrastRatio: Number((maxLum / Math.max(1, minLum)).toFixed(1)),
    shadowClippingPct: Number(((shadowCount / totalPixels) * 100).toFixed(1)),
    highlightClippingPct: Number(((highlightCount / totalPixels) * 100).toFixed(1)),
    histogram,
  };
}
