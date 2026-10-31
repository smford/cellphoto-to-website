import { describe, it, expect } from 'vitest';
import { analyzeEyes } from '../services/eyeDetector';
import type { DetectedFace } from '../services/imageFilters';

describe('eyeDetector', () => {
  it('correctly calculates interpupillary distance and eye boxes from landmarks', () => {
    const face: DetectedFace = {
      boundingBox: { x: 100, y: 100, width: 200, height: 200 },
      confidence: 0.95,
      landmarks: [
        { type: 'eye', x: 160, y: 170 }, // left eye on screen
        { type: 'eye', x: 240, y: 170 }, // right eye on screen
      ],
    };

    // Mock canvas context
    const mockCtx = {
      canvas: { width: 400, height: 400 },
      getImageData: () => ({
        data: new Uint8ClampedArray(100 * 100 * 4).fill(128),
      }),
    } as unknown as CanvasRenderingContext2D;

    const analyses = analyzeEyes([face], mockCtx);
    expect(analyses).toHaveLength(1);

    const a = analyses[0];
    expect(a.leftEye.x).toBe(160);
    expect(a.rightEye.x).toBe(240);
    expect(a.interpupillaryDistance).toBe(80);
    expect(a.eyeTiltAngleDeg).toBe(0);
  });
});
