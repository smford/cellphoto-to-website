import { describe, it, expect } from 'vitest';
import { getExifOrientation, rotateCanvas } from '../services/imageOrientation';

describe('imageOrientation', () => {
  it('returns default orientation 1 for empty or invalid buffer', async () => {
    const orientation = await getExifOrientation('');
    expect(orientation).toBe(1);
  });

  it('rotates canvas 90 degrees and swaps width and height', () => {
    const mockCanvas = { width: 100, height: 60 } as HTMLCanvasElement;
    const rotated = rotateCanvas(mockCanvas, 'cw');
    expect(rotated.width).toBe(60);
    expect(rotated.height).toBe(100);
  });

  it('rotates canvas 180 degrees preserving width and height', () => {
    const mockCanvas = { width: 100, height: 60 } as HTMLCanvasElement;
    const rotated = rotateCanvas(mockCanvas, '180');
    expect(rotated.width).toBe(100);
    expect(rotated.height).toBe(60);
  });
});
