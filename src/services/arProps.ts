import type { DetectedFace } from './imageFilters';

export type ARPropType = 'sunglasses' | 'crown' | 'party_hat' | 'halo';

/**
 * Draws fun in-browser augmented reality accessories onto faces.
 */
export function drawARProps(
  ctx: CanvasRenderingContext2D,
  faces: DetectedFace[],
  propType: ARPropType
) {
  faces.forEach((face) => {
    const { x, y, width, height } = face.boundingBox;
    const cx = x + width / 2;

    // Use eye landmarks if available, otherwise estimate
    const eyes = face.landmarks?.filter((lm) => lm.type === 'eye');
    let eyeY = y + height * 0.38;
    let eyeSpan = width * 0.6;

    if (eyes && eyes.length >= 2) {
      eyeY = (eyes[0].y + eyes[1].y) / 2;
      eyeSpan = Math.hypot(eyes[1].x - eyes[0].x, eyes[1].y - eyes[0].y) * 1.5;
    }

    ctx.save();

    switch (propType) {
      case 'sunglasses': {
        // Neon Cyberpunk Sunglasses
        const glassesW = Math.max(width * 0.9, eyeSpan * 1.4);
        const glassesH = glassesW * 0.32;
        const gx = cx - glassesW / 2;
        const gy = eyeY - glassesH / 2;

        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 15;

        // Dark frames
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;

        // Left lens
        ctx.beginPath();
        ctx.roundRect(gx, gy, glassesW * 0.46, glassesH, [8, 8, 20, 12]);
        ctx.fill();
        ctx.stroke();

        // Right lens
        ctx.beginPath();
        ctx.roundRect(gx + glassesW * 0.54, gy, glassesW * 0.46, glassesH, [8, 8, 12, 20]);
        ctx.fill();
        ctx.stroke();

        // Bridge
        ctx.beginPath();
        ctx.moveTo(gx + glassesW * 0.44, gy + glassesH * 0.3);
        ctx.lineTo(gx + glassesW * 0.56, gy + glassesH * 0.3);
        ctx.stroke();

        // Cyberpunk neon lens flare highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx + 10, gy + 8);
        ctx.lineTo(gx + glassesW * 0.3, gy + 8);
        ctx.stroke();
        break;
      }

      case 'crown': {
        // Golden King Crown
        const crownW = width * 0.95;
        const crownH = crownW * 0.6;
        const crownX = cx - crownW / 2;
        const crownY = y - crownH * 0.85;

        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 14;

        // Gold gradient
        const grad = ctx.createLinearGradient(crownX, crownY, crownX, crownY + crownH);
        grad.addColorStop(0, '#fde047');
        grad.addColorStop(0.5, '#eab308');
        grad.addColorStop(1, '#ca8a04');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        ctx.moveTo(crownX, crownY + crownH);
        ctx.lineTo(crownX + crownW, crownY + crownH);
        ctx.lineTo(crownX + crownW * 0.95, crownY + crownH * 0.3);
        ctx.lineTo(crownX + crownW * 0.72, crownY + crownH * 0.65);
        ctx.lineTo(crownX + crownW * 0.5, crownY);
        ctx.lineTo(crownX + crownW * 0.28, crownY + crownH * 0.65);
        ctx.lineTo(crownX + crownW * 0.05, crownY + crownH * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Jewels on peaks
        const jewels = [
          [crownX + crownW * 0.05, crownY + crownH * 0.3, '#ef4444'],
          [crownX + crownW * 0.5, crownY, '#3b82f6'],
          [crownX + crownW * 0.95, crownY + crownH * 0.3, '#10b981'],
        ] as const;

        jewels.forEach(([jx, jy, color]) => {
          ctx.beginPath();
          ctx.arc(jx, jy, crownW * 0.06, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.stroke();
        });
        break;
      }

      case 'halo': {
        // Golden Angel Halo
        const haloRx = width * 0.55;
        const haloRy = haloRx * 0.28;
        const haloY = y - height * 0.25;

        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 24;

        ctx.beginPath();
        ctx.ellipse(cx, haloY, haloRx, haloRy, 0, 0, 2 * Math.PI);
        ctx.lineWidth = Math.max(5, width * 0.035);
        ctx.strokeStyle = '#fef08a';
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(cx, haloY, haloRx, haloRy, 0, 0, 2 * Math.PI);
        ctx.lineWidth = Math.max(2, width * 0.015);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        break;
      }

      case 'party_hat': {
        // Striped Party Hat
        const hatW = width * 0.55;
        const hatH = height * 0.75;
        const hatX = cx - hatW / 2;
        const hatY = y - hatH * 0.85;

        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 10;

        // Base cone
        ctx.beginPath();
        ctx.moveTo(hatX, hatY + hatH);
        ctx.lineTo(cx, hatY);
        ctx.lineTo(hatX + hatW, hatY + hatH);
        ctx.closePath();
        ctx.fillStyle = '#ec4899';
        ctx.fill();

        // Pom-pom on top
        ctx.beginPath();
        ctx.arc(cx, hatY, hatW * 0.15, 0, 2 * Math.PI);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        break;
      }
    }

    ctx.restore();
  });
}
