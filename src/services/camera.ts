export class CameraManager {
  private stream: MediaStream | null = null;
  private currentFacingMode: 'user' | 'environment' = 'user';
  private currentDeviceId: string | null = null;

  public async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  public async start(
    videoElement: HTMLVideoElement,
    facingMode: 'user' | 'environment' = 'user',
    specificDeviceId?: string
  ): Promise<MediaStream> {
    this.stop();
    this.currentFacingMode = facingMode;
    this.currentDeviceId = specificDeviceId || null;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: specificDeviceId
        ? {
            deviceId: { exact: specificDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('Primary camera constraints failed, attempting fallback:', err);
      // Fallback with minimal constraints
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
    }

    videoElement.srcObject = this.stream;

    // Set mirror preview for selfie/front camera
    if (this.currentFacingMode === 'user') {
      videoElement.style.transform = 'scaleX(-1)';
    } else {
      videoElement.style.transform = 'scaleX(1)';
    }

    await videoElement.play().catch((playErr) => {
      console.warn('Autoplay prevented, requires user tap:', playErr);
    });

    return this.stream;
  }

  public async toggleCamera(videoElement: HTMLVideoElement): Promise<'user' | 'environment'> {
    const nextMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    await this.start(videoElement, nextMode);
    return nextMode;
  }

  public captureSnapshot(videoElement: HTMLVideoElement, quality = 0.95): string {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // If using user/front camera, flip horizontally to match the mirrored viewfinder
    if (this.currentFacingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  public stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
  }

  public getFacingMode(): 'user' | 'environment' {
    return this.currentFacingMode;
  }

  public getActiveDeviceId(): string | null {
    return this.currentDeviceId;
  }
}
