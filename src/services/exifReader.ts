import exifr from 'exifr';

export interface PhotoMetadata {
  make?: string;
  model?: string;
  lensModel?: string;
  fNumber?: number;
  exposureTime?: number;
  iso?: number;
  focalLength?: number;
  dateTimeOriginal?: Date | string;
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number | string;
  latitude?: number;
  longitude?: number;
}

/**
 * Extracts EXIF metadata from a Blob, File, or base64 string
 */
export async function extractPhotoMetadata(input: Blob | File | string): Promise<PhotoMetadata | null> {
  try {
    const output = await exifr.parse(input, [
      'Make',
      'Model',
      'LensModel',
      'FNumber',
      'ExposureTime',
      'ISO',
      'FocalLength',
      'DateTimeOriginal',
      'ImageWidth',
      'ImageHeight',
      'Orientation',
      'latitude',
      'longitude',
    ]);

    if (!output) return null;

    return {
      make: output.Make,
      model: output.Model,
      lensModel: output.LensModel,
      fNumber: output.FNumber,
      exposureTime: output.ExposureTime,
      iso: output.ISO,
      focalLength: output.FocalLength,
      dateTimeOriginal: output.DateTimeOriginal,
      imageWidth: output.ImageWidth || output.ExifImageWidth,
      imageHeight: output.ImageHeight || output.ExifImageHeight,
      orientation: output.Orientation,
      latitude: output.latitude,
      longitude: output.longitude,
    };
  } catch (err) {
    console.warn('Could not read EXIF tags:', err);
    return null;
  }
}
