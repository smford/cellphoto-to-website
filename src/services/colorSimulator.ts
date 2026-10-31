export type ColorDeficiencyType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

// Brettel / Machado standard simulation matrices in RGB space
const COLOR_MATRICES: Record<ColorDeficiencyType, [number, number, number, number, number, number, number, number, number]> = {
  protanopia: [
    0.56667, 0.43333, 0.0,
    0.55833, 0.44167, 0.0,
    0.0,     0.24167, 0.75833,
  ],
  deuteranopia: [
    0.625, 0.375, 0.0,
    0.70,  0.30,  0.0,
    0.0,   0.30,  0.70,
  ],
  tritanopia: [
    0.95, 0.05,  0.0,
    0.0,  0.433, 0.567,
    0.0,  0.475, 0.525,
  ],
  achromatopsia: [
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
    0.299, 0.587, 0.114,
  ],
};

/**
 * Simulates color vision deficiency on an ImageData buffer.
 */
export function simulateColorDeficiency(
  imageData: ImageData,
  type: ColorDeficiencyType
): ImageData {
  const { width, height, data } = imageData;
  const output = typeof ImageData !== 'undefined'
    ? new ImageData(width, height)
    : ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' } as unknown as ImageData);

  const outData = output.data;
  const m = COLOR_MATRICES[type];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    const simR = Math.min(255, Math.max(0, Math.round(m[0] * r + m[1] * g + m[2] * b)));
    const simG = Math.min(255, Math.max(0, Math.round(m[3] * r + m[4] * g + m[5] * b)));
    const simB = Math.min(255, Math.max(0, Math.round(m[6] * r + m[7] * g + m[8] * b)));

    outData[i] = simR;
    outData[i + 1] = simG;
    outData[i + 2] = simB;
    outData[i + 3] = a;
  }

  return output;
}
