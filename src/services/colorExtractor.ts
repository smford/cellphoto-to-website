export interface ExtractedColor {
  hex: string;
  rgb: [number, number, number];
  percentage: number;
  isLight: boolean;
}

/**
 * Converts RGB tuple to Hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Calculates luminance to determine if text on this color should be dark or light
 */
export function isColorLight(r: number, g: number, b: number): boolean {
  // ITU-R BT.709 formula
  const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return luminance > 0.6;
}

/**
 * Extracts dominant color palette from ImageData using k-means clustering.
 */
export function extractPaletteFromImageData(
  imageData: ImageData,
  k = 5,
  maxIterations = 10
): ExtractedColor[] {
  const data = imageData.data;
  const pixels: [number, number, number][] = [];

  // Downsample to max ~3000 sample points for high speed (<15ms)
  const step = Math.max(1, Math.floor(data.length / (4 * 3000)));

  for (let i = 0; i < data.length; i += step * 4) {
    const a = data[i + 3];
    if (a < 128) continue; // skip transparent
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  if (pixels.length === 0) {
    return [{ hex: '#000000', rgb: [0, 0, 0], percentage: 100, isLight: false }];
  }

  // Initialize centroids spread across pixel range
  const actualK = Math.min(k, pixels.length);
  const centroids: [number, number, number][] = [];
  for (let i = 0; i < actualK; i++) {
    const idx = Math.floor((i / actualK) * pixels.length);
    centroids.push([...pixels[idx]]);
  }

  const assignments = new Int32Array(pixels.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Assign each pixel to closest centroid
    for (let p = 0; p < pixels.length; p++) {
      const [pr, pg, pb] = pixels[p];
      let minDist = Infinity;
      let closest = 0;

      for (let c = 0; c < actualK; c++) {
        const [cr, cg, cb] = centroids[c];
        const dist = (pr - cr) ** 2 + (pg - cg) ** 2 + (pb - cb) ** 2;
        if (dist < minDist) {
          minDist = dist;
          closest = c;
        }
      }
      assignments[p] = closest;
    }

    // 2. Recompute centroids
    const sums: [number, number, number, number][] = Array.from({ length: actualK }, () => [0, 0, 0, 0]);
    for (let p = 0; p < pixels.length; p++) {
      const c = assignments[p];
      sums[c][0] += pixels[p][0];
      sums[c][1] += pixels[p][1];
      sums[c][2] += pixels[p][2];
      sums[c][3] += 1;
    }

    for (let c = 0; c < actualK; c++) {
      const count = sums[c][3];
      if (count > 0) {
        centroids[c] = [
          Math.round(sums[c][0] / count),
          Math.round(sums[c][1] / count),
          Math.round(sums[c][2] / count),
        ];
      }
    }
  }

  // Calculate cluster percentages
  const counts = new Array(actualK).fill(0);
  for (let p = 0; p < pixels.length; p++) {
    counts[assignments[p]]++;
  }

  const results: ExtractedColor[] = centroids
    .map((rgb, idx) => {
      const percentage = Math.round((counts[idx] / pixels.length) * 100);
      return {
        hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
        rgb,
        percentage,
        isLight: isColorLight(rgb[0], rgb[1], rgb[2]),
      };
    })
    .filter((c) => c.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);

  return results;
}
