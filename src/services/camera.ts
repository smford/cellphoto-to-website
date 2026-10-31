export class CameraManager {
  private stream: MediaStream | null = null;
  private currentFacingMode: 'user' | 'environment' = 'user';

  public async start(
    videoElement: HTMLVideoElement,
    facingMode: 'user' | 'environment' = 'user'
  ): Promise<MediaStream> {
    this.stop();
    this.currentFacingMode = facingMode;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // Fallback with minimal constraints
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    }

    videoElement.srcObject = this.stream;
    await videoElement.play();
    return this.stream;
  }

  public toggleCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    const nextMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    return this.start(videoElement, nextMode);
  }

  public captureSnapshot(videoElement: HTMLVideoElement, quality = 0.95): string {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // If using user/front camera, flip horizontally for natural mirror feel
    if (this.currentFacingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  public stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  public getFacingMode() {
    return this.currentFacingMode;
  }
}
