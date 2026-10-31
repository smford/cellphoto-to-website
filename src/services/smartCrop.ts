import type { DetectedFace } from './imageFilters';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates a 1:1 portrait avatar crop bounding box centered comfortably around detected face.
 */
export function calculateAvatarCrop(
  imageWidth: number,
  imageHeight: number,
  face?: DetectedFace
): CropRect {
  if (!face) {
    // Center square fallback
    const size = Math.min(imageWidth, imageHeight);
    return {
      x: Math.round((imageWidth - size) / 2),
      y: Math.round((imageHeight - size) / 2),
      width: size,
      height: size,
    };
  }

  const { x, y, width, height } = face.boundingBox;
  const faceCenterX = x + width / 2;
  const faceCenterY = y + height / 2;

  // Face should occupy ~45% of avatar dimension
  const cropSize = Math.min(
    Math.max(width, height) * 2.2,
    Math.min(imageWidth, imageHeight)
  );

  let cropX = faceCenterX - cropSize / 2;
  // Position face slightly above vertical center (rule of thirds for portrait)
  let cropY = faceCenterY - cropSize * 0.42;

  // Clamp within image bounds
  cropX = Math.max(0, Math.min(imageWidth - cropSize, cropX));
  cropY = Math.max(0, Math.min(imageHeight - cropSize, cropY));

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(cropSize),
    height: Math.round(cropSize),
  };
}
