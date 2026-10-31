import { describe, it, expect } from 'vitest';
import { analyzeImageQuality } from '../services/imageDiagnostics';

describe('imageDiagnostics', () => {
  it('detects uniform/flat image as soft/low-variance', () => {
    // 10x10 uniform gray image
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128;
      data[i + 1] = 128;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
    const imgData = { data, width: 10, height: 10, colorSpace: 'srgb' as PredefinedColorSpace };
    const diag = analyzeImageQuality(imgData as ImageData);

    expect(diag.sharpnessScore).toBe(0);
    expect(diag.sharpnessGrade).toBe('Soft / Motion Blurred');
    expect(diag.averageLuminance).toBe(128);
    expect(diag.exposureGrade).toBe('Well Exposed');
  });

  it('detects sharp alternating edges with high variance', () => {
    // 10x10 alternating black and white checkerboard
    const data = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const val = (x + y) % 2 === 0 ? 255 : 0;
        const idx = (y * 10 + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
    const imgData = { data, width: 10, height: 10, colorSpace: 'srgb' as PredefinedColorSpace };
    const diag = analyzeImageQuality(imgData as ImageData);

    expect(diag.sharpnessScore).toBeGreaterThan(1000);
    expect(diag.sharpnessGrade).toBe('Crisp & Sharp');
  });
});
