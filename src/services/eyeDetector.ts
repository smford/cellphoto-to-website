import type { DetectedFace } from './imageFilters';

export interface DetectedEye {
  side: 'left' | 'right';
  x: number;
  y: number;
  radius: number;
  box: { x: number; y: number; width: number; height: number };
  isOpen: boolean;
}

export interface EyeAnalysisResult {
  faceIndex: number;
  leftEye: DetectedEye;
  rightEye: DetectedEye;
  interpupillaryDistance: number; // Distance in pixels
  eyeTiltAngleDeg: number;        // Roll angle of eyes in degrees
  eyeState: 'Both Eyes Open' | 'Wink (Left Eye Closed)' | 'Wink (Right Eye Closed)' | 'Eyes Closed / Squinting';
}

/**
 * Extracts and analyzes eyes from detected faces and image data.
 */
export function analyzeEyes(
  faces: DetectedFace[],
  canvasCtx: CanvasRenderingContext2D
): EyeAnalysisResult[] {
  const results: EyeAnalysisResult[] = [];

  faces.forEach((face, faceIdx) => {
    const { x, y, width, height } = face.boundingBox;

    // Retrieve or estimate eye positions
    const eyes = face.landmarks?.filter((lm) => lm.type === 'eye') || [];
    let eye1X = 0, eye1Y = 0, eye2X = 0, eye2Y = 0;

    if (eyes.length >= 2) {
      eye1X = eyes[0].x;
      eye1Y = eyes[0].y;
      eye2X = eyes[1].x;
      eye2Y = eyes[1].y;
    } else {
      // Anthropometric estimates based on facial bounding box
      eye1X = x + width * 0.32;
      eye1Y = y + height * 0.38;
      eye2X = x + width * 0.68;
      eye2Y = y + height * 0.38;
    }

    // Determine which is left vs right on screen
    const screenLeftX = Math.min(eye1X, eye2X);
    const screenLeftY = screenLeftX === eye1X ? eye1Y : eye2Y;
    const screenRightX = Math.max(eye1X, eye2X);
    const screenRightY = screenRightX === eye2X ? eye2Y : eye1Y;

    const eyeRadius = Math.max(12, width * 0.08);

    // Eye openness analysis via local vertical contrast / edge variance
    const checkEyeOpenness = (cx: number, cy: number, radius: number): boolean => {
      try {
        const startX = Math.max(0, Math.floor(cx - radius));
        const startY = Math.max(0, Math.floor(cy - radius * 0.6));
        const w = Math.min(canvasCtx.canvas.width - startX, Math.ceil(radius * 2));
        const h = Math.min(canvasCtx.canvas.height - startY, Math.ceil(radius * 1.2));

        if (w <= 2 || h <= 2) return true;

        const imgData = canvasCtx.getImageData(startX, startY, w, h);
        const data = imgData.data;

        // An open eye has sclera (white) and pupil/iris (dark), creating high variance
        let minLum = 255, maxLum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
        }

        // Dynamic range within eye socket > 60 indicates distinct pupil/sclera contrast
        return maxLum - minLum > 60;
      } catch {
        return true;
      }
    };

    const leftOpen = checkEyeOpenness(screenLeftX, screenLeftY, eyeRadius);
    const rightOpen = checkEyeOpenness(screenRightX, screenRightY, eyeRadius);

    const dx = screenRightX - screenLeftX;
    const dy = screenRightY - screenLeftY;
    const ipd = Math.round(Math.hypot(dx, dy));
    const tiltDeg = Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1));

    let eyeState: EyeAnalysisResult['eyeState'] = 'Both Eyes Open';
    if (!leftOpen && !rightOpen) {
      eyeState = 'Eyes Closed / Squinting';
    } else if (!leftOpen) {
      eyeState = 'Wink (Left Eye Closed)';
    } else if (!rightOpen) {
      eyeState = 'Wink (Right Eye Closed)';
    }

    results.push({
      faceIndex: faceIdx + 1,
      leftEye: {
        side: 'left',
        x: screenLeftX,
        y: screenLeftY,
        radius: eyeRadius,
        box: {
          x: screenLeftX - eyeRadius,
          y: screenLeftY - eyeRadius * 0.7,
          width: eyeRadius * 2,
          height: eyeRadius * 1.4,
        },
        isOpen: leftOpen,
      },
      rightEye: {
        side: 'right',
        x: screenRightX,
        y: screenRightY,
        radius: eyeRadius,
        box: {
          x: screenRightX - eyeRadius,
          y: screenRightY - eyeRadius * 0.7,
          width: eyeRadius * 2,
          height: eyeRadius * 1.4,
        },
        isOpen: rightOpen,
      },
      interpupillaryDistance: ipd,
      eyeTiltAngleDeg: tiltDeg,
      eyeState,
    });
  });

  return results;
}

/**
 * Draws precision biometric reticles around detected eyes with crosshairs.
 */
export function drawEyeBiometricReticles(
  ctx: CanvasRenderingContext2D,
  analyses: EyeAnalysisResult[]
) {
  analyses.forEach((analysis) => {
    [analysis.leftEye, analysis.rightEye].forEach((eye) => {
      ctx.save();

      // Outer circular reticle
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;

      ctx.beginPath();
      ctx.arc(eye.x, eye.y, eye.radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Corner brackets on eye bounding box
      const { x, y, width, height } = eye.box;
      const cornerLen = Math.min(8, width * 0.25);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#38bdf8';

      // Top-left
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(x + width - cornerLen, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + cornerLen);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(x, y + height - cornerLen);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x + cornerLen, y + height);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(x + width - cornerLen, y + height);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + width, y + height - cornerLen);
      ctx.stroke();

      // Center crosshair dot
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();

      // Horizontal crosshair ticks
      ctx.beginPath();
      ctx.moveTo(eye.x - eye.radius - 4, eye.y);
      ctx.lineTo(eye.x - eye.radius + 2, eye.y);
      ctx.moveTo(eye.x + eye.radius - 2, eye.y);
      ctx.lineTo(eye.x + eye.radius + 4, eye.y);
      ctx.stroke();

      // Label
      const label = `${eye.side.toUpperCase()} EYE (${Math.round(eye.x)}, ${Math.round(eye.y)})`;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'black';
      ctx.fillText(label, eye.x - eye.radius, eye.y - eye.radius - 6);

      ctx.restore();
    });

    // Draw connecting line between pupils showing IPD
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(analysis.leftEye.x, analysis.leftEye.y);
    ctx.lineTo(analysis.rightEye.x, analysis.rightEye.y);
    ctx.stroke();

    // IPD Badge
    const midX = (analysis.leftEye.x + analysis.rightEye.x) / 2;
    const midY = (analysis.leftEye.y + analysis.rightEye.y) / 2 - 8;
    ctx.font = '700 11px system-ui';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'black';
    ctx.fillText(`IPD: ${analysis.interpupillaryDistance}px`, midX, midY);
    ctx.restore();
  });
}

/**
 * Draws a black privacy censor bar over both eyes.
 */
export function drawEyePrivacyBar(
  ctx: CanvasRenderingContext2D,
  analyses: EyeAnalysisResult[]
) {
  analyses.forEach((analysis) => {
    const { leftEye, rightEye } = analysis;
    const paddingX = leftEye.radius * 0.8;
    const startX = leftEye.x - leftEye.radius - paddingX;
    const endX = rightEye.x + rightEye.radius + paddingX;
    const barWidth = endX - startX;
    const barHeight = Math.max(leftEye.radius, rightEye.radius) * 2;
    const centerY = (leftEye.y + rightEye.y) / 2;

    ctx.save();
    ctx.translate((startX + endX) / 2, centerY);
    ctx.rotate((analysis.eyeTiltAngleDeg * Math.PI) / 180);

    ctx.fillStyle = '#000000';
    ctx.fillRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight);

    ctx.restore();
  });
}

/**
 * Draws glowing neon cyberpunk iris rings on the pupils.
 */
export function drawGlowingIrises(
  ctx: CanvasRenderingContext2D,
  analyses: EyeAnalysisResult[],
  glowColor = '#a855f7'
) {
  analyses.forEach((analysis) => {
    [analysis.leftEye, analysis.rightEye].forEach((eye) => {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 18;

      // Iris ring
      const irisRadius = eye.radius * 0.45;
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, irisRadius, 0, 2 * Math.PI);
      ctx.lineWidth = 3;
      ctx.strokeStyle = glowColor;
      ctx.stroke();

      // Pupil center
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, irisRadius * 0.4, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    });
  });
}
