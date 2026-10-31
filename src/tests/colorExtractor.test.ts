import { describe, it, expect } from 'vitest';
import { rgbToHex, isColorLight, extractPaletteFromImageData } from '../services/colorExtractor';

describe('colorExtractor', () => {
  it('converts rgb to hex properly', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 0, 128)).toBe('#FF0080');
  });

  it('determines lightness correctly for text contrast', () => {
    expect(isColorLight(255, 255, 255)).toBe(true);
    expect(isColorLight(0, 0, 0)).toBe(false);
    expect(isColorLight(240, 240, 240)).toBe(true);
    expect(isColorLight(20, 20, 20)).toBe(false);
  });

  it('extracts dominant color from pure color ImageData', () => {
    // 2x2 red image
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
    ]);
    const mockImageData = { data, width: 2, height: 2, colorSpace: 'srgb' as PredefinedColorSpace };

    const palette = extractPaletteFromImageData(mockImageData, 3);
    expect(palette.length).toBeGreaterThanOrEqual(1);
    expect(palette[0].hex).toBe('#FF0000');
    expect(palette[0].percentage).toBe(100);
    expect(palette[0].isLight).toBe(false);
  });
});
