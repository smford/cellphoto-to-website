import { describe, it, expect } from 'vitest';
import { calculateAvatarCrop } from '../services/smartCrop';
import { simulateColorDeficiency } from '../services/colorSimulator';
import { detectTextRegions } from '../services/textDetector';

describe('smartCrop', () => {
  it('calculates avatar crop centered on face', () => {
    const face = {
      boundingBox: { x: 400, y: 300, width: 200, height: 200 },
      confidence: 0.95,
    };
    const crop = calculateAvatarCrop(1920, 1080, face);

    expect(crop.width).toBe(crop.height);
    expect(crop.x).toBeGreaterThan(0);
    expect(crop.y).toBeGreaterThan(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1920);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1080);
  });
});

describe('colorSimulator', () => {
  it('simulates achromatopsia by producing equal RGB channels', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255]); // Pure red
    const imgData = { data, width: 1, height: 1, colorSpace: 'srgb' as PredefinedColorSpace };

    const simulated = simulateColorDeficiency(imgData as ImageData, 'achromatopsia');
    const r = simulated.data[0];
    const g = simulated.data[1];
    const b = simulated.data[2];

    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe('textDetector', () => {
  it('returns empty array when no high density edges are present', () => {
    const data = new Uint8ClampedArray(32 * 32 * 4); // Pure black
    const imgData = { data, width: 32, height: 32, colorSpace: 'srgb' as PredefinedColorSpace };

    const blocks = detectTextRegions(imgData as ImageData);
    expect(blocks).toEqual([]);
  });
});
