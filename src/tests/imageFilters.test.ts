import { describe, it, expect } from 'vitest';
import { applySobelFilter, applyDocumentScanFilter } from '../services/imageFilters';

describe('imageFilters', () => {
  it('applies Sobel filter and produces gradient magnitude image', () => {
    // 3x3 mock image data
    const data = new Uint8ClampedArray(3 * 3 * 4);
    // Vertical edge: left column dark, right column bright
    for (let y = 0; y < 3; y++) {
      data[(y * 3 + 0) * 4] = 0;
      data[(y * 3 + 0) * 4 + 3] = 255;
      data[(y * 3 + 1) * 4] = 128;
      data[(y * 3 + 1) * 4 + 3] = 255;
      data[(y * 3 + 2) * 4] = 255;
      data[(y * 3 + 2) * 4 + 3] = 255;
    }

    const input = { data, width: 3, height: 3, colorSpace: 'srgb' as PredefinedColorSpace };
    const output = applySobelFilter(input as ImageData);

    expect(output.width).toBe(3);
    expect(output.height).toBe(3);
    // Center pixel should have positive edge magnitude
    const centerIdx = (1 * 3 + 1) * 4;
    expect(output.data[centerIdx]).toBeGreaterThan(0);
    expect(output.data[centerIdx + 3]).toBe(255);
  });

  it('applies document scan thresholding filter', () => {
    const data = new Uint8ClampedArray([
      20, 20, 20, 255,      // dark pixel -> 0
      240, 240, 240, 255,  // bright pixel -> 255
    ]);
    const input = { data, width: 2, height: 1, colorSpace: 'srgb' as PredefinedColorSpace };
    const output = applyDocumentScanFilter(input as ImageData);

    expect(output.data[0]).toBe(0);
    expect(output.data[4]).toBe(255);
  });
});
