export interface DetectedTextBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  estimatedLines: number;
}

/**
 * Detects printed or written text regions in an image using in-browser edge density and line clustering.
 */
export function detectTextRegions(imageData: ImageData): DetectedTextBlock[] {
  const { width, height, data } = imageData;
  const blocks: DetectedTextBlock[] = [];

  // Downsample grid for speed
  const gridW = Math.floor(width / 16);
  const gridH = Math.floor(height / 16);
  if (gridW <= 1 || gridH <= 1) return blocks;

  const edgeDensity = new Float32Array(gridW * gridH);

  // Compute horizontal edge magnitude (text has high horizontal gradient density)
  for (let gy = 0; gy < gridH; gy++) {
    const startY = gy * 16;
    for (let gx = 0; gx < gridW; gx++) {
      const startX = gx * 16;
      let gradSum = 0;

      for (let dy = 0; dy < 16 && startY + dy < height; dy++) {
        const row = (startY + dy) * width;
        for (let dx = 0; dx < 15 && startX + dx + 1 < width; dx++) {
          const idx = (row + startX + dx) * 4;
          const nextIdx = (row + startX + dx + 1) * 4;

          const lum1 = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const lum2 = 0.299 * data[nextIdx] + 0.587 * data[nextIdx + 1] + 0.114 * data[nextIdx + 2];
          gradSum += Math.abs(lum1 - lum2);
        }
      }

      edgeDensity[gy * gridW + gx] = gradSum / 256;
    }
  }

  // Threshold dense blocks
  let avgDensity = 0;
  for (let i = 0; i < edgeDensity.length; i++) avgDensity += edgeDensity[i];
  avgDensity /= edgeDensity.length;

  const threshold = Math.max(18, avgDensity * 1.5);
  const visited = new Uint8Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      if (visited[idx] || edgeDensity[idx] < threshold) continue;

      // Flood-fill connected component
      let minX = gx, maxX = gx, minY = gy, maxY = gy;
      let clusterSize = 0;
      const stack = [[gx, gy]];
      visited[idx] = 1;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        clusterSize++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
            const nIdx = ny * gridW + nx;
            if (!visited[nIdx] && edgeDensity[nIdx] >= threshold * 0.8) {
              visited[nIdx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
      }

      // Filter noise: text lines are horizontally oriented and have multiple cells
      const blockW = (maxX - minX + 1) * 16;
      const blockH = (maxY - minY + 1) * 16;
      if (clusterSize >= 3 && blockW >= 40 && blockH >= 16) {
        blocks.push({
          x: minX * 16,
          y: minY * 16,
          width: blockW,
          height: blockH,
          confidence: Math.min(0.98, 0.6 + clusterSize * 0.03),
          estimatedLines: Math.max(1, Math.round(blockH / 24)),
        });
      }
    }
  }

  return blocks;
}
