export interface DetectedFace {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  landmarks?: {
    type: 'eye' | 'nose' | 'mouth' | 'ear';
    x: number;
    y: number;
  }[];
}

export function createImageData(width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(width, height);
  }
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

/**
 * Applies a Sobel edge detection convolution filter on an ImageData canvas.
 */
export function applySobelFilter(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const output = createImageData(width, height);
  const dst = output.data;

  // Pre-calculate grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    gray[p] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  }

  // Sobel 3x3 kernels
  for (let y = 1; y < height - 1; y++) {
    const yOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOffset + x;

      const g00 = gray[idx - width - 1];
      const g01 = gray[idx - width];
      const g02 = gray[idx - width + 1];

      const g10 = gray[idx - 1];
      const g12 = gray[idx + 1];

      const g20 = gray[idx + width - 1];
      const g21 = gray[idx + width];
      const g22 = gray[idx + width + 1];

      const gx = -g00 + g02 - 2 * g10 + 2 * g12 - g20 + g22;
      const gy = -g00 - 2 * g01 - g02 + g20 + 2 * g21 + g22;

      const mag = Math.min(255, Math.hypot(gx, gy));

      const outIdx = (yOffset + x) * 4;
      dst[outIdx] = mag;
      dst[outIdx + 1] = mag;
      dst[outIdx + 2] = mag;
      dst[outIdx + 3] = 255;
    }
  }

  return output;
}

/**
 * Applies an adaptive high-contrast document scan threshold filter.
 */
export function applyDocumentScanFilter(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const output = createImageData(width, height);
  const dst = output.data;

  // Compute average luminance
  let totalLuminance = 0;
  for (let i = 0; i < src.length; i += 4) {
    totalLuminance += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  }
  const avg = totalLuminance / (width * height);
  const threshold = Math.max(90, Math.min(160, avg * 0.95));

  for (let i = 0; i < src.length; i += 4) {
    const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    const val = lum > threshold ? 255 : 0;
    dst[i] = val;
    dst[i + 1] = val;
    dst[i + 2] = val;
    dst[i + 3] = 255;
  }

  return output;
}

/**
 * Pixelates faces in a Canvas for privacy protection.
 */
export function pixelateFaces(
  ctx: CanvasRenderingContext2D,
  faces: DetectedFace[],
  pixelSize = 16
): void {
  for (const face of faces) {
    const { x, y, width, height } = face.boundingBox;
    const clampedX = Math.max(0, Math.floor(x));
    const clampedY = Math.max(0, Math.floor(y));
    const clampedW = Math.min(ctx.canvas.width - clampedX, Math.ceil(width));
    const clampedH = Math.min(ctx.canvas.height - clampedY, Math.ceil(height));

    if (clampedW <= 0 || clampedH <= 0) continue;

    const imgData = ctx.getImageData(clampedX, clampedY, clampedW, clampedH);
    const data = imgData.data;

    for (let py = 0; py < clampedH; py += pixelSize) {
      for (let px = 0; px < clampedW; px += pixelSize) {
        // Average the block
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < pixelSize && py + dy < clampedH; dy++) {
          for (let dx = 0; dx < pixelSize && px + dx < clampedW; dx++) {
            const idx = ((py + dy) * clampedW + (px + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        // Fill the block
        for (let dy = 0; dy < pixelSize && py + dy < clampedH; dy++) {
          for (let dx = 0; dx < pixelSize && px + dx < clampedW; dx++) {
            const idx = ((py + dy) * clampedW + (px + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
        }
      }
    }

    ctx.putImageData(imgData, clampedX, clampedY);
  }
}

/**
 * Draws clean circular/oval boundary around faces and landmarks onto canvas context.
 */
export function drawFaceCircles(
  ctx: CanvasRenderingContext2D,
  faces: DetectedFace[],
  options: {
    showLandmarks?: boolean;
    showLabel?: boolean;
    accentColor?: string;
  } = {}
): void {
  const { showLandmarks = true, showLabel = true, accentColor = '#3b82f6' } = options;

  faces.forEach((face, idx) => {
    const { x, y, width, height } = face.boundingBox;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radiusX = (width / 2) * 1.15;
    const radiusY = (height / 2) * 1.25;

    ctx.save();

    // Outer glow
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;

    // Draw main circle / ellipse around discovered face
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.lineWidth = Math.max(3, Math.round(width * 0.015));
    ctx.strokeStyle = accentColor;
    ctx.stroke();

    // Secondary subtle reticle marks (like camera focus)
    const reticleDist = Math.max(radiusX, radiusY) + 8;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#60a5fa';

    // Top tick
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - reticleDist - 6);
    ctx.lineTo(centerX, centerY - reticleDist + 4);
    ctx.stroke();

    // Bottom tick
    ctx.beginPath();
    ctx.moveTo(centerX, centerY + reticleDist - 4);
    ctx.lineTo(centerX, centerY + reticleDist + 6);
    ctx.stroke();

    // Left tick
    ctx.beginPath();
    ctx.moveTo(centerX - reticleDist - 6, centerY);
    ctx.lineTo(centerX - reticleDist + 4, centerY);
    ctx.stroke();

    // Right tick
    ctx.beginPath();
    ctx.moveTo(centerX + reticleDist - 4, centerY);
    ctx.lineTo(centerX + reticleDist + 6, centerY);
    ctx.stroke();

    // Landmarks if available
    if (showLandmarks && face.landmarks) {
      face.landmarks.forEach((landmark) => {
        ctx.beginPath();
        ctx.arc(landmark.x, landmark.y, Math.max(3, width * 0.02), 0, 2 * Math.PI);
        ctx.fillStyle = landmark.type === 'eye' ? '#38bdf8' : landmark.type === 'nose' ? '#fbbf24' : '#f43f5e';
        ctx.shadowBlur = 6;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      });
    }

    // Badge Label
    if (showLabel) {
      const confidencePercent = Math.round(face.confidence * 100);
      const labelText = `Face #${idx + 1} (${confidencePercent}%)`;
      const fontSize = Math.max(13, Math.round(width * 0.06));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

      const textMetrics = ctx.measureText(labelText);
      const badgePaddingX = 8;
      const badgeHeight = fontSize + 8;
      const badgeWidth = textMetrics.width + badgePaddingX * 2;
      const badgeX = centerX - badgeWidth / 2;
      const badgeY = centerY - radiusY - badgeHeight - 6;

      // Badge pill background
      ctx.shadowBlur = 4;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
      ctx.fill();

      // Border
      ctx.lineWidth = 1;
      ctx.strokeStyle = accentColor;
      ctx.stroke();

      // Text
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, badgeX + badgePaddingX, badgeY + badgeHeight / 2);
    }

    ctx.restore();
  });
}
