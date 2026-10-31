import QRCode from 'qrcode';
import { WebRTCReceiver, WebRTCSender } from './services/webrtc';
import { CameraManager } from './services/camera';
import { detectFaces } from './services/faceDetector';
import { detectBarcodes } from './services/qrDetector';
import { detectObjects } from './services/objectDetector';
import { extractPaletteFromImageData } from './services/colorExtractor';
import { applySobelFilter, applyDocumentScanFilter, pixelateFaces, drawFaceCircles, type DetectedFace } from './services/imageFilters';
import { extractPhotoMetadata, type PhotoMetadata } from './services/exifReader';
import { analyzeImageQuality } from './services/imageDiagnostics';
import { simulateColorDeficiency, type ColorDeficiencyType } from './services/colorSimulator';
import { applyPortraitBokeh } from './services/portraitBokeh';
import { drawARProps, type ARPropType } from './services/arProps';
import { calculateAvatarCrop } from './services/smartCrop';
import { detectTextRegions } from './services/textDetector';
import {
  analyzeEyes,
  drawEyeBiometricReticles,
  drawGlowingIrises,
  drawEyePrivacyBar,
  type EyeAnalysisResult,
} from './services/eyeDetector';
import { getExifOrientation, renderOrientedImage, rotateCanvas } from './services/imageOrientation';
import { removeBackground, type BackgroundRemovalMode } from './services/backgroundRemoval';

// UI State
interface AppState {
  originalImage: HTMLImageElement | HTMLCanvasElement | null;
  currentPhotoDataUrl: string | null;
  detectedFaces: DetectedFace[];
  eyeAnalyses: EyeAnalysisResult[];
  eyeRenderMode: 'reticles' | 'glowing_iris' | 'privacy_bar';
  exifData: PhotoMetadata | null;
  activeFeature: string | null;
  privacyBlurEnabled: boolean;
  currentARProp: ARPropType;
  currentColorDeficiency: ColorDeficiencyType;
  backgroundCutoutCanvas: HTMLCanvasElement | null;
}

const state: AppState = {
  originalImage: null,
  currentPhotoDataUrl: null,
  detectedFaces: [],
  eyeAnalyses: [],
  eyeRenderMode: 'reticles',
  exifData: null,
  activeFeature: 'faces',
  privacyBlurEnabled: false,
  currentARProp: 'sunglasses',
  currentColorDeficiency: 'deuteranopia',
  backgroundCutoutCanvas: null,
};

// Services
const cameraManager = new CameraManager();
let webrtcReceiver: WebRTCReceiver | null = null;
let currentSessionId = '';

// DOM Elements
const desktopApp = document.getElementById('desktopApp')!;
const mobileRemoteApp = document.getElementById('mobileRemoteApp')!;
const sourceSelectionSection = document.getElementById('sourceSelectionSection')!;
const studioSection = document.getElementById('studioSection')!;

const photoCanvas = document.getElementById('photoCanvas') as HTMLCanvasElement;
const canvasCtx = photoCanvas.getContext('2d')!;
const canvasLoadingSpinner = document.getElementById('canvasLoadingSpinner')!;
const canvasLoadingText = document.getElementById('canvasLoadingText')!;

// Toasts
export function showToast(message: string, duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// --------------------------------------------------------------------------
// 1. ROUTER: Check if this is the Mobile Remote Camera View (?role=camera)
// --------------------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const userRole = urlParams.get('role');
const targetSession = urlParams.get('session');

if (userRole === 'camera' && targetSession) {
  initMobileRemoteMode(targetSession);
} else {
  initDesktopMode();
}

// --------------------------------------------------------------------------
// 2. MOBILE REMOTE CAMERA MODE (With Rear / Front Camera Switch)
// --------------------------------------------------------------------------
function setupMobileViewportObserver() {
  const applyViewport = () => {
    const vv = window.visualViewport;
    const width = vv ? vv.width : window.innerWidth;
    const height = vv ? vv.height : window.innerHeight;
    const offsetTop = vv ? vv.offsetTop : 0;

    document.documentElement.style.setProperty('--app-viewport-width', `${width}px`);
    document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--app-viewport-top', `${offsetTop}px`);
  };

  applyViewport();
  window.visualViewport?.addEventListener('resize', applyViewport);
  window.visualViewport?.addEventListener('scroll', applyViewport);
  window.addEventListener('resize', applyViewport);
  window.addEventListener('orientationchange', () => {
    setTimeout(applyViewport, 120);
  });
}

async function initMobileRemoteMode(sessionId: string) {
  document.body.classList.add('mobile-camera-active');
  document.documentElement.classList.add('mobile-camera-active');
  setupMobileViewportObserver();

  desktopApp.style.display = 'none';
  mobileRemoteApp.style.display = 'flex';

  const remotePeerStatus = document.getElementById('remotePeerStatus')!;
  const mobileCameraVideo = document.getElementById('mobileCameraVideo') as HTMLVideoElement;
  const btnMobileShutter = document.getElementById('btnMobileShutter')!;
  const btnMobileFlipCamera = document.getElementById('btnMobileFlipCamera')!;
  const btnMobileCameraPill = document.getElementById('btnMobileCameraPill')!;
  const btnMobileFullscreen = document.getElementById('btnMobileFullscreen');
  const mobileCameraLabel = document.getElementById('mobileCameraLabel')!;
  const mobileFileInput = document.getElementById('mobileFileInput') as HTMLInputElement;
  const mobileTransferOverlay = document.getElementById('mobileTransferOverlay')!;
  const mobileTransferProgress = document.getElementById('mobileTransferProgress')!;
  const cameraFlashOverlay = document.getElementById('cameraFlashOverlay');

  // Fullscreen support for tablets and mobile devices
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ('webkitRequestFullscreen' in document.documentElement) {
        // @ts-expect-error iOS Safari Webkit Fullscreen API
        document.documentElement.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  btnMobileFullscreen?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });

  // Attempt fullscreen on first user touch/tap
  const requestFullscreenOnce = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ('webkitRequestFullscreen' in document.documentElement) {
        // @ts-expect-error iOS Safari Webkit Fullscreen API
        document.documentElement.webkitRequestFullscreen();
      }
    }
  };
  window.addEventListener('click', requestFullscreenOnce, { once: true });
  window.addEventListener('touchstart', requestFullscreenOnce, { once: true });

  const triggerShutterFlash = () => {
    if (cameraFlashOverlay) {
      cameraFlashOverlay.classList.add('flash-active');
      setTimeout(() => cameraFlashOverlay.classList.remove('flash-active'), 120);
    }
    if (navigator.vibrate) {
      navigator.vibrate(40);
    }
  };

  const updateCameraLabel = (mode: 'user' | 'environment') => {
    if (mode === 'user') {
      mobileCameraLabel.textContent = '🤳 Front Camera';
    } else {
      mobileCameraLabel.textContent = '📸 Rear Camera';
    }
  };

  // 1. Initialize mobile camera (rear camera ideal on start)
  try {
    await cameraManager.start(mobileCameraVideo, 'environment');
    updateCameraLabel('environment');
  } catch (err) {
    console.error('Camera access failed:', err);
    remotePeerStatus.textContent = 'Camera blocked. Use camera roll below.';
  }

  // 2. Connect to Desktop via WebRTC
  const sender = new WebRTCSender();
  try {
    remotePeerStatus.textContent = 'Dialing desktop peer...';
    await sender.connect(sessionId);
    remotePeerStatus.textContent = 'Connected to Desktop 🖥️';
    remotePeerStatus.style.color = '#34d399';
  } catch (err) {
    console.error('P2P connection error:', err);
    remotePeerStatus.textContent = 'Connection failed. Re-scan QR code.';
  }

  // Switch camera handler (works from bottom flip button OR top indicator pill)
  const handleToggleCamera = async () => {
    try {
      const nextMode = await cameraManager.toggleCamera(mobileCameraVideo);
      updateCameraLabel(nextMode);
    } catch (e) {
      console.error('Failed to toggle camera:', e);
      alert('Could not switch camera.');
    }
  };

  btnMobileFlipCamera.addEventListener('click', handleToggleCamera);
  btnMobileCameraPill?.addEventListener('click', handleToggleCamera);

  const sendImage = async (dataUrl: string) => {
    mobileTransferOverlay.style.display = 'flex';
    mobileTransferProgress.textContent = 'Sending photo to desktop (0%)...';

    try {
      await sender.sendPhoto(dataUrl, 'image/jpeg', (progress) => {
        const pct = Math.round(progress * 100);
        mobileTransferProgress.textContent = `Sending photo (${pct}%)...`;
      });
      mobileTransferProgress.textContent = 'Sent! Check desktop 🎉';
      setTimeout(() => {
        mobileTransferOverlay.style.display = 'none';
      }, 1500);
    } catch (err) {
      console.error('Send error:', err);
      alert('Failed to send image: ' + (err as Error).message);
      mobileTransferOverlay.style.display = 'none';
    }
  };

  btnMobileShutter.addEventListener('click', async () => {
    try {
      triggerShutterFlash();
      const snapshot = cameraManager.captureSnapshot(mobileCameraVideo);
      await sendImage(snapshot);
    } catch (e) {
      console.error(e);
      alert('Could not capture photo. Try choosing from camera roll.');
    }
  });

  mobileFileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        await sendImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  });
}

// --------------------------------------------------------------------------
// 3. DESKTOP MODE (Photo Studio & Multi-Source Hub)
// --------------------------------------------------------------------------
function initDesktopMode() {
  setupWebRTC();
  setupUploadSource();
  setupWebcamSource();
  setupStudioInteractions();
}

/**
 * Initializes WebRTC Receiver & QR Code
 */
async function setupWebRTC() {
  const webrtcStatusBadge = document.getElementById('webrtcStatusBadge')!;
  const webrtcStatusText = document.getElementById('webrtcStatusText')!;
  const qrCanvas = document.getElementById('qrCanvas') as HTMLCanvasElement;
  const qrStatusText = document.getElementById('qrStatusText')!;
  const btnCopyP2PLink = document.getElementById('btnCopyP2PLink')!;
  const btnOpenMobileTest = document.getElementById('btnOpenMobileTest')!;

  webrtcReceiver = new WebRTCReceiver({
    onSessionReady: (id) => {
      currentSessionId = id;
      console.log('WebRTC session ready:', currentSessionId);
      webrtcStatusBadge.className = 'status-badge online';
      webrtcStatusText.textContent = `P2P Ready (${id.slice(0, 8)})`;

      // Generate Mobile URL
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('role', 'camera');
      currentUrl.searchParams.set('session', id);
      const mobileUrl = currentUrl.toString();

      // Render QR Code
      QRCode.toCanvas(qrCanvas, mobileUrl, {
        width: 170,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      btnCopyP2PLink.onclick = () => {
        navigator.clipboard.writeText(mobileUrl);
        showToast('Mobile link copied to clipboard!');
      };

      btnOpenMobileTest.onclick = () => {
        window.open(mobileUrl, '_blank');
      };
    },
    onDeviceConnected: (peerId) => {
      webrtcStatusBadge.className = 'status-badge connected';
      webrtcStatusText.textContent = 'Phone Connected';
      qrStatusText.innerHTML = `
        <span class="status-dot" style="background: #10b981;"></span>
        Phone connected (${peerId.slice(0, 6)}...)! Take photo on phone.
      `;
      showToast('Mobile device connected via WebRTC DataChannel!');
    },
    onProgress: (progress) => {
      const pct = Math.round(progress * 100);
      qrStatusText.innerHTML = `
        <span class="status-dot" style="background: #3b82f6;"></span>
        Receiving photo: ${pct}%
      `;
    },
    onPhotoReceived: (dataUrl) => {
      qrStatusText.innerHTML = `
        <span class="status-dot" style="background: #10b981;"></span>
        Photo received! Loading studio...
      `;
      showToast('Photo received from phone over encrypted WebRTC!');
      loadPhotoIntoStudio(dataUrl);
    },
    onDeviceDisconnected: () => {
      webrtcStatusBadge.className = 'status-badge online';
      webrtcStatusText.textContent = 'P2P Ready';
      qrStatusText.innerHTML = `
        <span class="status-dot" style="background: #f59e0b;"></span>
        Device disconnected. Waiting for next device...
      `;
    },
    onError: (err) => {
      console.warn('WebRTC Receiver error:', err);
      webrtcStatusText.textContent = 'P2P Reconnecting';
    },
  });

  try {
    await webrtcReceiver.init();
  } catch (err) {
    console.error('Failed to init WebRTC receiver:', err);
    webrtcStatusText.textContent = 'P2P Offline';
  }
}

/**
 * Option 1: File Upload & Drag & Drop & Clipboard
 */
function setupUploadSource() {
  const dropzone = document.getElementById('dropzone')!;
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const btnBrowseFile = document.getElementById('btnBrowseFile')!;

  btnBrowseFile.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  // Drag and Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  });

  // Global Clipboard Paste (Cmd+V / Ctrl+V)
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          showToast('Image pasted from clipboard!');
          handleFile(file);
          break;
        }
      }
    }
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadPhotoIntoStudio(reader.result, file);
      }
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Option 2: Computer Webcam Capture
 */
function setupWebcamSource() {
  const btnOpenWebcam = document.getElementById('btnOpenWebcam')!;
  const webcamDialog = document.getElementById('webcamDialog') as HTMLDialogElement;
  const btnCloseWebcam = document.getElementById('btnCloseWebcam')!;
  const webcamVideo = document.getElementById('webcamVideo') as HTMLVideoElement;
  const btnFlipWebcam = document.getElementById('btnFlipWebcam')!;
  const btnTimerWebcam = document.getElementById('btnTimerWebcam')!;
  const btnSnapWebcam = document.getElementById('btnSnapWebcam')!;
  const countdownOverlay = document.getElementById('countdownOverlay')!;

  let timerCountdown = 0;

  btnOpenWebcam.addEventListener('click', async () => {
    try {
      webcamDialog.showModal();
      await cameraManager.start(webcamVideo, 'user');
    } catch (err) {
      console.error(err);
      alert('Camera access denied or no camera device found.');
      webcamDialog.close();
    }
  });

  btnCloseWebcam.addEventListener('click', () => {
    cameraManager.stop();
    webcamDialog.close();
  });

  btnFlipWebcam.addEventListener('click', async () => {
    await cameraManager.toggleCamera(webcamVideo);
  });

  btnTimerWebcam.addEventListener('click', () => {
    timerCountdown = 3;
    btnTimerWebcam.textContent = '⏱️ 3s Active';
    showToast('3s timer armed!');
  });

  btnSnapWebcam.addEventListener('click', () => {
    if (timerCountdown > 0) {
      let count = timerCountdown;
      countdownOverlay.style.display = 'flex';
      countdownOverlay.textContent = String(count);

      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          countdownOverlay.textContent = String(count);
        } else {
          clearInterval(interval);
          countdownOverlay.style.display = 'none';
          triggerSnap();
        }
      }, 1000);
    } else {
      triggerSnap();
    }
  });

  function triggerSnap() {
    const snapshot = cameraManager.captureSnapshot(webcamVideo);
    cameraManager.stop();
    webcamDialog.close();
    loadPhotoIntoStudio(snapshot);
  }
}

// --------------------------------------------------------------------------
// 4. PHOTO STUDIO & DETECTION CONTROLS
// --------------------------------------------------------------------------
async function loadPhotoIntoStudio(dataUrl: string, sourceFile?: File | Blob) {
  state.currentPhotoDataUrl = dataUrl;
  state.detectedFaces = [];
  state.eyeAnalyses = [];
  state.backgroundCutoutCanvas = null;
  state.activeFeature = 'faces';
  state.privacyBlurEnabled = false;

  const canvasWrapper = document.querySelector('.canvas-wrapper');
  canvasWrapper?.classList.remove('checkerboard');

  // Show studio view, hide source selection
  sourceSelectionSection.style.display = 'none';
  studioSection.style.display = 'flex';

  // Read EXIF metadata and orientation asynchronously
  extractPhotoMetadata(sourceFile || dataUrl).then((meta) => {
    state.exifData = meta;
  });

  const orientation = await getExifOrientation(sourceFile || dataUrl);

  // Load image onto Canvas
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = async () => {
    // Automatically apply EXIF orientation so image matches how picture was taken
    if (orientation > 1) {
      state.originalImage = renderOrientedImage(img, orientation);
      showToast(`Automatically oriented photo (EXIF Tag: ${orientation})`);
    } else {
      state.originalImage = img;
    }

    photoCanvas.width = state.originalImage.width;
    photoCanvas.height = state.originalImage.height;

    const dimBadge = document.getElementById('photoDimensionBadge');
    if (dimBadge) {
      dimBadge.textContent = `${photoCanvas.width} × ${photoCanvas.height} px`;
    }

    renderOriginalCanvas();

    // Automatically run Face Detection on loaded photo as requested!
    await runFaceDetection();
  };
  img.src = dataUrl;
}

function renderOriginalCanvas() {
  if (!state.originalImage) return;
  canvasCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
  canvasCtx.drawImage(state.originalImage, 0, 0, photoCanvas.width, photoCanvas.height);
}

function showCanvasLoading(text: string) {
  canvasLoadingSpinner.style.display = 'flex';
  canvasLoadingText.textContent = text;
}

function hideCanvasLoading() {
  canvasLoadingSpinner.style.display = 'none';
}

/**
 * Runs Face Detection and draws stylish circles around discovered faces
 */
async function runFaceDetection() {
  if (!state.originalImage) return;
  showCanvasLoading('Detecting faces in-browser...');

  try {
    state.detectedFaces = await detectFaces(state.originalImage);
    const faceCountBadge = document.getElementById('faceCountBadge')!;
    faceCountBadge.textContent = String(state.detectedFaces.length);

    redrawCanvas();

    if (state.detectedFaces.length > 0) {
      showToast(`Detected ${state.detectedFaces.length} face(s)!`);
      showResultsPanel(
        'Detected Faces',
        state.detectedFaces
          .map(
            (f, idx) =>
              `<div class="result-item">
                <strong>Face #${idx + 1}</strong>: ${Math.round(f.confidence * 100)}% confidence
                <br><span style="font-size: 0.75rem; color: #94a3b8;">Bounds: [${Math.round(f.boundingBox.x)}, ${Math.round(f.boundingBox.y)}, ${Math.round(f.boundingBox.width)} × ${Math.round(f.boundingBox.height)}]</span>
              </div>`
          )
          .join('')
      );
    } else {
      showToast('No faces discovered in this photo.');
      showResultsPanel(
        'Face Detection',
        '<div class="result-item">No faces detected with current threshold. Try another photo or adjust lighting.</div>'
      );
    }
  } catch (err) {
    console.error('Face detection failed:', err);
    showToast('Face detection error: ' + (err as Error).message);
  } finally {
    hideCanvasLoading();
  }
}

/**
 * Redraws canvas according to active filters & features
 */
function redrawCanvas() {
  if (state.activeFeature === 'background' && state.backgroundCutoutCanvas) {
    canvasCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
    canvasCtx.drawImage(state.backgroundCutoutCanvas, 0, 0);
    return;
  }

  renderOriginalCanvas();

  // If privacy blur enabled, blur faces first
  if (state.privacyBlurEnabled && state.detectedFaces.length > 0) {
    pixelateFaces(canvasCtx, state.detectedFaces, Math.max(12, Math.round(photoCanvas.width * 0.02)));
  }

  // Draw face circles if face detection active
  if (state.activeFeature === 'faces' && state.detectedFaces.length > 0) {
    drawFaceCircles(canvasCtx, state.detectedFaces, {
      showLandmarks: true,
      showLabel: true,
      accentColor: '#3b82f6',
    });
  }

  // Draw AR Props if active
  if (state.activeFeature === 'ar_props' && state.detectedFaces.length > 0) {
    drawARProps(canvasCtx, state.detectedFaces, state.currentARProp);
  }

  // Draw Eye Detection if active
  if (state.activeFeature === 'eyes' && state.eyeAnalyses.length > 0) {
    if (state.eyeRenderMode === 'reticles') {
      drawEyeBiometricReticles(canvasCtx, state.eyeAnalyses);
    } else if (state.eyeRenderMode === 'glowing_iris') {
      drawGlowingIrises(canvasCtx, state.eyeAnalyses, '#06b6d4');
    } else if (state.eyeRenderMode === 'privacy_bar') {
      drawEyePrivacyBar(canvasCtx, state.eyeAnalyses);
    }
  }
}

function showResultsPanel(title: string, htmlContent: string) {
  const card = document.getElementById('resultsPanelCard')!;
  const titleElem = document.getElementById('resultsPanelTitle')!;
  const container = document.getElementById('detectionResultsContainer')!;

  card.style.display = 'block';
  titleElem.textContent = title;
  container.innerHTML = htmlContent;
}

/**
 * Setup detection sidebar feature buttons
 */
function setupStudioInteractions() {
  const btnNewPhoto = document.getElementById('btnNewPhoto')!;
  const btnResetFilters = document.getElementById('btnResetFilters')!;
  const btnDownloadPhoto = document.getElementById('btnDownloadPhoto')!;

  const btnDetectFace = document.getElementById('btnDetectFace')!;
  const btnDetectEyes = document.getElementById('btnDetectEyes');
  const btnPrivacyBlur = document.getElementById('btnPrivacyBlur')!;
  const btnARProps = document.getElementById('btnARProps')!;
  const btnSmartCrop = document.getElementById('btnSmartCrop')!;

  const btnQualityDiagnostics = document.getElementById('btnQualityDiagnostics')!;
  const btnPortraitBokeh = document.getElementById('btnPortraitBokeh')!;
  const btnDetectText = document.getElementById('btnDetectText')!;
  const btnColorSimulator = document.getElementById('btnColorSimulator')!;
  const btnDetectQR = document.getElementById('btnDetectQR')!;
  const btnDetectObjects = document.getElementById('btnDetectObjects')!;
  const btnExtractPalette = document.getElementById('btnExtractPalette')!;
  const btnDocumentScan = document.getElementById('btnDocumentScan')!;
  const btnInspectExif = document.getElementById('btnInspectExif')!;

  btnNewPhoto.addEventListener('click', () => {
    studioSection.style.display = 'none';
    sourceSelectionSection.style.display = 'block';
  });

  btnResetFilters.addEventListener('click', () => {
    state.activeFeature = null;
    state.privacyBlurEnabled = false;
    state.backgroundCutoutCanvas = null;
    document.querySelector('.canvas-wrapper')?.classList.remove('checkerboard');
    btnPrivacyBlur.classList.remove('active');
    btnDetectFace.classList.remove('active');
    btnDetectEyes?.classList.remove('active');
    renderOriginalCanvas();
    showToast('Reset to original photo.');
  });

  // Manual 90° Image Rotation Handlers
  const btnRotateCW = document.getElementById('btnRotateCW');
  const btnRotateCCW = document.getElementById('btnRotateCCW');

  const handleManualRotate = async (dir: 'cw' | 'ccw') => {
    if (!state.originalImage) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = state.originalImage.width;
    tempCanvas.height = state.originalImage.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(state.originalImage, 0, 0);

    const rotated = rotateCanvas(tempCanvas, dir);
    state.originalImage = rotated;
    state.backgroundCutoutCanvas = null;
    document.querySelector('.canvas-wrapper')?.classList.remove('checkerboard');

    photoCanvas.width = rotated.width;
    photoCanvas.height = rotated.height;

    const dimBadge = document.getElementById('photoDimensionBadge');
    if (dimBadge) {
      dimBadge.textContent = `${photoCanvas.width} × ${photoCanvas.height} px`;
    }

    renderOriginalCanvas();
    showToast(`Rotated 90° ${dir === 'cw' ? 'clockwise' : 'counter-clockwise'}`);

    // Re-detect faces and features on the new orientation
    await runFaceDetection();
  };

  btnRotateCW?.addEventListener('click', () => handleManualRotate('cw'));
  btnRotateCCW?.addEventListener('click', () => handleManualRotate('ccw'));

  // Feature: Background Removal & Cutout
  const btnRemoveBackground = document.getElementById('btnRemoveBackground');
  const btnStudioBackground = document.getElementById('btnStudioBackground');
  const canvasWrapper = document.querySelector('.canvas-wrapper');

  btnRemoveBackground?.addEventListener('click', async () => {
    state.activeFeature = 'background';
    showCanvasLoading('Stripping background in-browser...');

    try {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = photoCanvas.width;
      srcCanvas.height = photoCanvas.height;
      const sCtx = srcCanvas.getContext('2d')!;
      sCtx.drawImage(state.originalImage!, 0, 0);

      const cutout = await removeBackground(srcCanvas, 'transparent');
      state.backgroundCutoutCanvas = cutout;

      canvasWrapper?.classList.add('checkerboard');
      canvasCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
      canvasCtx.drawImage(cutout, 0, 0);

      showResultsPanel(
        'Background Stripped (Cutout)',
        `
        <div class="result-item" style="text-align: center;">
          <p style="margin-bottom: 0.5rem; color: #34d399; font-weight: 700;">Foreground subject isolated!</p>
          <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.75rem;">
            Background removed with full alpha transparency. The checkerboard pattern indicates transparent areas.
          </p>
          <button class="btn btn-primary btn-sm" id="btnDownloadCutout">
            Download Transparent PNG
          </button>
        </div>
      `
      );

      document.getElementById('btnDownloadCutout')?.addEventListener('click', () => {
        const a = document.createElement('a');
        a.download = `cutout-${Date.now()}.png`;
        a.href = photoCanvas.toDataURL('image/png');
        a.click();
        showToast('Downloaded transparent PNG cutout!');
      });

      showToast('Background removed successfully!');
    } catch (err) {
      console.error(err);
      showToast('Background removal failed: ' + (err as Error).message);
    } finally {
      hideCanvasLoading();
    }
  });

  btnStudioBackground?.addEventListener('click', async () => {
    state.activeFeature = 'background_studio';
    canvasWrapper?.classList.remove('checkerboard');
    showCanvasLoading('Applying studio backdrop...');

    try {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = photoCanvas.width;
      srcCanvas.height = photoCanvas.height;
      const sCtx = srcCanvas.getContext('2d')!;
      sCtx.drawImage(state.originalImage!, 0, 0);

      const applyBackdrop = async (mode: BackgroundRemovalMode, label: string) => {
        showCanvasLoading(`Rendering ${label}...`);
        const resultCanvas = await removeBackground(srcCanvas, mode);
        canvasCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
        canvasCtx.drawImage(resultCanvas, 0, 0);
        hideCanvasLoading();
        showToast(`Applied ${label}!`);
      };

      await applyBackdrop('white', 'Studio White Backdrop');

      const studioOptions: { id: BackgroundRemovalMode; label: string; desc: string }[] = [
        { id: 'white', label: 'Studio White', desc: 'Clean high-key white e-commerce / passport backdrop' },
        { id: 'charcoal', label: 'Studio Charcoal', desc: 'Modern dark slate backdrop (#1a202c)' },
        { id: 'neon_blue', label: 'Cyberpunk Blue', desc: 'Vibrant studio blue backdrop (#2563eb)' },
      ];

      const html = `
        <p style="margin-bottom: 0.5rem;">Choose a studio backdrop color:</p>
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          ${studioOptions
            .map(
              (opt) => `
            <button class="btn btn-secondary btn-sm" style="text-align: left; justify-content: flex-start; display: block;" id="bg_${opt.id}">
              <strong>${opt.label}</strong>
              <div style="font-size: 0.7rem; color: #94a3b8;">${opt.desc}</div>
            </button>
          `
            )
            .join('')}
        </div>
      `;

      showResultsPanel('Studio Backdrop Replacement', html);

      studioOptions.forEach((opt) => {
        document.getElementById(`bg_${opt.id}`)?.addEventListener('click', () => {
          applyBackdrop(opt.id, opt.label);
        });
      });
    } catch (err) {
      console.error(err);
      showToast('Backdrop failed: ' + (err as Error).message);
    } finally {
      hideCanvasLoading();
    }
  });

  btnDownloadPhoto.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `cellphoto-${Date.now()}.png`;
    link.href = photoCanvas.toDataURL('image/png');
    link.click();
    showToast('Downloaded photo!');
  });

  // Feature: Face Circles
  btnDetectFace.addEventListener('click', async () => {
    state.activeFeature = 'faces';
    btnDetectEyes?.classList.remove('active');
    btnDetectFace.classList.add('active');
    if (state.detectedFaces.length === 0) {
      await runFaceDetection();
    } else {
      redrawCanvas();
    }
  });

  // Feature: Biometric Eye Detection & Tracking
  btnDetectEyes?.addEventListener('click', async () => {
    state.activeFeature = 'eyes';
    btnDetectFace.classList.remove('active');
    btnDetectEyes.classList.add('active');

    if (state.detectedFaces.length === 0) {
      showCanvasLoading('Detecting faces and eye coordinates...');
      try {
        state.detectedFaces = await detectFaces(state.originalImage!);
        const faceCountBadge = document.getElementById('faceCountBadge')!;
        faceCountBadge.textContent = String(state.detectedFaces.length);
      } finally {
        hideCanvasLoading();
      }
    }

    renderOriginalCanvas();
    state.eyeAnalyses = analyzeEyes(state.detectedFaces, canvasCtx);
    redrawCanvas();

    if (state.eyeAnalyses.length > 0) {
      showToast(`Analyzed eyes on ${state.eyeAnalyses.length} face(s)!`);

      const details = state.eyeAnalyses
        .map(
          (ea) => `
          <div class="result-item">
            <strong>Face #${ea.faceIndex} Eye Biometrics:</strong>
            <div style="margin-top: 4px;"><strong>IPD (Pupil Distance):</strong> <span style="color: #38bdf8; font-weight: 700;">${ea.interpupillaryDistance} px</span></div>
            <div><strong>Eye Line Tilt:</strong> ${ea.eyeTiltAngleDeg}°</div>
            <div><strong>Eye State:</strong> <span style="color: #34d399; font-weight: 600;">${ea.eyeState}</span></div>
            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">
              Left Eye: (${Math.round(ea.leftEye.x)}, ${Math.round(ea.leftEye.y)}) | Right Eye: (${Math.round(ea.rightEye.x)}, ${Math.round(ea.rightEye.y)})
            </div>
          </div>
        `
        )
        .join('');

      const modesHtml = `
        <div style="display: flex; gap: 0.4rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" id="btnEyeReticles">Biometric Reticles</button>
          <button class="btn btn-secondary btn-sm" id="btnEyeGlowingIris">Glowing Irises</button>
          <button class="btn btn-secondary btn-sm" id="btnEyePrivacyBar">Privacy Censor</button>
        </div>
        ${details}
      `;

      showResultsPanel('Biometric Eye Detection', modesHtml);

      document.getElementById('btnEyeReticles')?.addEventListener('click', () => {
        state.eyeRenderMode = 'reticles';
        redrawCanvas();
        showToast('Active: Biometric Eye Reticles');
      });

      document.getElementById('btnEyeGlowingIris')?.addEventListener('click', () => {
        state.eyeRenderMode = 'glowing_iris';
        redrawCanvas();
        showToast('Active: Glowing Iris Effect');
      });

      document.getElementById('btnEyePrivacyBar')?.addEventListener('click', () => {
        state.eyeRenderMode = 'privacy_bar';
        redrawCanvas();
        showToast('Active: Privacy Eye Censor Bar');
      });
    } else {
      showToast('No eyes detected. Ensure a face is visible.');
      showResultsPanel(
        'Eye Detection',
        '<div class="result-item">Could not locate eye coordinates. Try a photo with a clearer front-facing subject.</div>'
      );
    }
  });

  // Feature: Privacy Blur
  btnPrivacyBlur.addEventListener('click', async () => {
    state.privacyBlurEnabled = !state.privacyBlurEnabled;
    btnPrivacyBlur.classList.toggle('active', state.privacyBlurEnabled);
    if (state.detectedFaces.length === 0) {
      await runFaceDetection();
    } else {
      redrawCanvas();
    }
    showToast(state.privacyBlurEnabled ? 'Privacy blur applied to faces!' : 'Privacy blur removed.');
  });

  // Feature: AR Face Props
  btnARProps.addEventListener('click', async () => {
    state.activeFeature = 'ar_props';
    if (state.detectedFaces.length === 0) {
      await runFaceDetection();
    } else {
      redrawCanvas();
    }

    const props: { id: ARPropType; label: string }[] = [
      { id: 'sunglasses', label: '🕶️ Cyberpunk Neon Glasses' },
      { id: 'crown', label: '👑 Golden Crown' },
      { id: 'party_hat', label: '🥳 Party Hat' },
      { id: 'halo', label: '😇 Golden Halo' },
    ];

    const html = `
      <p style="margin-bottom: 0.5rem;">Select an AR prop to align onto detected faces:</p>
      <div style="display: flex; flex-direction: column; gap: 0.4rem;">
        ${props
          .map(
            (p) => `
          <button class="btn btn-secondary btn-sm" style="text-align: left; justify-content: flex-start;" id="prop_${p.id}">
            ${p.label}
          </button>
        `
          )
          .join('')}
      </div>
    `;

    showResultsPanel('Augmented Reality Props', html);

    props.forEach((p) => {
      document.getElementById(`prop_${p.id}`)?.addEventListener('click', () => {
        state.currentARProp = p.id;
        redrawCanvas();
        showToast(`Applied ${p.label}!`);
      });
    });
  });

  // Feature: Smart Avatar Crop
  btnSmartCrop.addEventListener('click', () => {
    state.activeFeature = 'smart_crop';
    renderOriginalCanvas();

    const crop = calculateAvatarCrop(photoCanvas.width, photoCanvas.height, state.detectedFaces[0]);

    // Draw crop reticle
    canvasCtx.save();
    canvasCtx.strokeStyle = '#38bdf8';
    canvasCtx.lineWidth = 4;
    canvasCtx.setLineDash([12, 6]);
    canvasCtx.strokeRect(crop.x, crop.y, crop.width, crop.height);

    // Darken exterior area
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    canvasCtx.fillRect(0, 0, photoCanvas.width, crop.y);
    canvasCtx.fillRect(0, crop.y, crop.x, crop.height);
    canvasCtx.fillRect(crop.x + crop.width, crop.y, photoCanvas.width - (crop.x + crop.width), crop.height);
    canvasCtx.fillRect(0, crop.y + crop.height, photoCanvas.width, photoCanvas.height - (crop.y + crop.height));
    canvasCtx.restore();

    // Create avatar preview canvas
    const avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = 400;
    avatarCanvas.height = 400;
    const avCtx = avatarCanvas.getContext('2d')!;
    avCtx.drawImage(state.originalImage!, crop.x, crop.y, crop.width, crop.height, 0, 0, 400, 400);

    const avatarDataUrl = avatarCanvas.toDataURL('image/png');

    showResultsPanel(
      'Smart Portrait Avatar (1:1)',
      `
      <div class="result-item" style="text-align: center;">
        <img src="${avatarDataUrl}" style="width: 140px; height: 140px; border-radius: 50%; border: 3px solid #38bdf8; margin: 0 auto 0.75rem; display: block; object-fit: cover;">
        <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.5rem;">Optimal 1:1 circular crop centered on facial geometry.</p>
        <button class="btn btn-primary btn-sm" id="btnDownloadAvatar">
          Download 1:1 Avatar
        </button>
      </div>
    `
    );

    document.getElementById('btnDownloadAvatar')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `avatar-${Date.now()}.png`;
      a.href = avatarDataUrl;
      a.click();
      showToast('Downloaded square avatar!');
    });

    showToast('Calculated smart avatar crop!');
  });

  // Feature: Focus Sharpness & Blur Diagnostics
  btnQualityDiagnostics.addEventListener('click', () => {
    state.activeFeature = 'diagnostics';
    renderOriginalCanvas();

    const imgData = canvasCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
    const diag = analyzeImageQuality(imgData);

    const scoreColor =
      diag.sharpnessGrade === 'Crisp & Sharp'
        ? '#34d399'
        : diag.sharpnessGrade === 'Moderate Focus'
        ? '#f59e0b'
        : '#ef4444';

    const html = `
      <div class="result-item">
        <strong>Focus Sharpness:</strong>
        <span style="color: ${scoreColor}; font-weight: 700; margin-left: 4px;">${diag.sharpnessGrade}</span>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">Laplacian Variance Score: ${diag.sharpnessScore}</div>
      </div>

      <div class="result-item">
        <strong>Exposure Balance:</strong> ${diag.exposureGrade}
        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">Avg Luminance: ${diag.averageLuminance} / 255 | Contrast: ${diag.contrastRatio}:1</div>
      </div>

      <div class="result-item">
        <strong>Dynamic Range Clipping:</strong>
        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">
          Clipped Shadows: ${diag.shadowClippingPct}% | Clipped Highlights: ${diag.highlightClippingPct}%
        </div>
      </div>
    `;

    showResultsPanel('Image Quality Diagnostics', html);
    showToast(`Sharpness Score: ${diag.sharpnessScore} (${diag.sharpnessGrade})`);
  });

  // Feature: Portrait Bokeh Blur (f/1.4)
  btnPortraitBokeh.addEventListener('click', async () => {
    state.activeFeature = 'bokeh';
    showCanvasLoading('Rendering synthetic bokeh lens blur...');

    try {
      if (state.detectedFaces.length === 0) {
        state.detectedFaces = await detectFaces(state.originalImage!);
      }

      const bokehCanvas = applyPortraitBokeh(photoCanvas, state.detectedFaces, 16);
      canvasCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
      canvasCtx.drawImage(bokehCanvas, 0, 0);

      showResultsPanel(
        'Portrait Depth Bokeh',
        `
        <div class="result-item">
          Applied synthetic depth-of-field blur with focal center on detected subject. Simulates a large aperture portrait lens (f/1.4).
        </div>
      `
      );
      showToast('Rendered portrait bokeh blur!');
    } finally {
      hideCanvasLoading();
    }
  });

  // Feature: Text Detection
  btnDetectText.addEventListener('click', () => {
    state.activeFeature = 'text';
    renderOriginalCanvas();

    const imgData = canvasCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
    const textBlocks = detectTextRegions(imgData);

    if (textBlocks.length > 0) {
      canvasCtx.save();
      canvasCtx.strokeStyle = '#f59e0b';
      canvasCtx.lineWidth = 3;

      textBlocks.forEach((tb) => {
        canvasCtx.strokeRect(tb.x, tb.y, tb.width, tb.height);
      });
      canvasCtx.restore();

      showResultsPanel(
        'Detected Text Regions',
        `
        <p style="margin-bottom: 0.5rem;">Discovered ${textBlocks.length} text region(s):</p>
        ${textBlocks
          .map(
            (tb, i) => `
          <div class="result-item">
            <strong>Block #${i + 1}</strong>: ~${tb.estimatedLines} line(s) of text
            <br><span style="font-size: 0.75rem; color: #94a3b8;">${tb.width} × ${tb.height} px at (${tb.x}, ${tb.y})</span>
          </div>
        `
          )
          .join('')}
      `
      );
      showToast(`Discovered ${textBlocks.length} text regions!`);
    } else {
      showResultsPanel('Text Detection', '<div class="result-item">No dense text blocks found in this image.</div>');
      showToast('No text blocks found.');
    }
  });

  // Feature: Color Blindness Simulator
  btnColorSimulator.addEventListener('click', () => {
    state.activeFeature = 'color_sim';

    const renderSimulation = (type: ColorDeficiencyType) => {
      renderOriginalCanvas();
      const rawData = canvasCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
      const simulated = simulateColorDeficiency(rawData, type);
      canvasCtx.putImageData(simulated, 0, 0);
    };

    renderSimulation(state.currentColorDeficiency);

    const options: { id: ColorDeficiencyType; label: string; desc: string }[] = [
      { id: 'deuteranopia', label: 'Deuteranopia', desc: 'Green-blind (most common, ~6% males)' },
      { id: 'protanopia', label: 'Protanopia', desc: 'Red-blind (~2% males)' },
      { id: 'tritanopia', label: 'Tritanopia', desc: 'Blue-yellow deficiency (<0.1%)' },
      { id: 'achromatopsia', label: 'Achromatopsia', desc: 'Complete color blindness (monochrome)' },
    ];

    const html = `
      <p style="margin-bottom: 0.5rem;">Simulate how color vision deficient viewers see this photo:</p>
      <div style="display: flex; flex-direction: column; gap: 0.4rem;">
        ${options
          .map(
            (opt) => `
          <button class="btn btn-secondary btn-sm" style="text-align: left; justify-content: flex-start; display: block;" id="sim_${opt.id}">
            <strong>${opt.label}</strong>
            <div style="font-size: 0.7rem; color: #94a3b8;">${opt.desc}</div>
          </button>
        `
          )
          .join('')}
      </div>
    `;

    showResultsPanel('Color Blindness Simulator', html);

    options.forEach((opt) => {
      document.getElementById(`sim_${opt.id}`)?.addEventListener('click', () => {
        state.currentColorDeficiency = opt.id;
        renderSimulation(opt.id);
        showToast(`Simulating ${opt.label}!`);
      });
    });

    showToast('Applied color vision simulation!');
  });

  // Feature: QR & Barcode Detection
  btnDetectQR.addEventListener('click', async () => {
    state.activeFeature = 'qr';
    renderOriginalCanvas();
    showCanvasLoading('Scanning for QR codes & barcodes...');

    try {
      const barcodes = await detectBarcodes(photoCanvas, canvasCtx);
      if (barcodes.length > 0) {
        showToast(`Discovered ${barcodes.length} barcode/QR code!`);

        canvasCtx.lineWidth = 4;
        canvasCtx.strokeStyle = '#10b981';
        barcodes.forEach((b) => {
          if (b.boundingBox) {
            canvasCtx.strokeRect(b.boundingBox.x, b.boundingBox.y, b.boundingBox.width, b.boundingBox.height);
          }
        });

        const html = barcodes
          .map(
            (b) => `
          <div class="result-item">
            <strong>${b.format.toUpperCase()}</strong>:
            <div style="word-break: break-all; margin: 4px 0; color: #6ee7b7;">${b.rawValue}</div>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${b.rawValue.replace(/'/g, "\\'")}'); alert('Copied text!');">
              Copy Content
            </button>
          </div>
        `
          )
          .join('');
        showResultsPanel('Decoded Barcodes & QR', html);
      } else {
        showToast('No barcodes or QR codes found in image.');
        showResultsPanel('Barcodes & QR', '<div class="result-item">No readable barcodes or QR codes detected.</div>');
      }
    } finally {
      hideCanvasLoading();
    }
  });

  // Feature: Object Detection
  btnDetectObjects.addEventListener('click', async () => {
    state.activeFeature = 'objects';
    renderOriginalCanvas();
    showCanvasLoading('Running in-browser object detector...');

    try {
      const objects = await detectObjects(photoCanvas);
      if (objects.length > 0) {
        showToast(`Detected ${objects.length} object(s)!`);

        objects.forEach((obj, idx) => {
          const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];
          const color = colors[idx % colors.length];

          canvasCtx.save();
          canvasCtx.strokeStyle = color;
          canvasCtx.lineWidth = 3;
          canvasCtx.strokeRect(obj.boundingBox.x, obj.boundingBox.y, obj.boundingBox.width, obj.boundingBox.height);

          const label = `${obj.label} (${Math.round(obj.confidence * 100)}%)`;
          canvasCtx.font = '600 14px system-ui';
          canvasCtx.fillStyle = color;
          canvasCtx.fillRect(obj.boundingBox.x, obj.boundingBox.y - 24, canvasCtx.measureText(label).width + 12, 24);
          canvasCtx.fillStyle = '#ffffff';
          canvasCtx.fillText(label, obj.boundingBox.x + 6, obj.boundingBox.y - 7);
          canvasCtx.restore();
        });

        const html = objects
          .map(
            (o) => `
          <div class="result-item">
            <strong>${o.label}</strong>: ${Math.round(o.confidence * 100)}% match
          </div>
        `
          )
          .join('');
        showResultsPanel('Detected Objects', html);
      } else {
        showToast('No prominent objects detected.');
        showResultsPanel('Object Detection', '<div class="result-item">No high-confidence objects recognized.</div>');
      }
    } finally {
      hideCanvasLoading();
    }
  });

  // Feature: Color Palette Extraction
  btnExtractPalette.addEventListener('click', () => {
    state.activeFeature = 'palette';
    renderOriginalCanvas();

    const imgData = canvasCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
    const palette = extractPaletteFromImageData(imgData, 6);

    const swatchesHtml = `
      <p style="margin-bottom: 0.5rem;">Top dominant colors extracted via k-means clustering:</p>
      <div class="palette-chips">
        ${palette
          .map(
            (c) => `
          <div class="palette-chip" style="background-color: ${c.hex}; color: ${c.isLight ? '#000000' : '#ffffff'};"
               title="${c.hex} (${c.percentage}%) - Click to copy"
               onclick="navigator.clipboard.writeText('${c.hex}'); alert('Copied ${c.hex}!');">
            ${c.hex}
          </div>
        `
          )
          .join('')}
      </div>
    `;

    showResultsPanel('Dominant Color Palette', swatchesHtml);
    showToast('Extracted color palette!');
  });

  // Feature: Document Scan & Sobel Filter
  btnDocumentScan.addEventListener('click', () => {
    state.activeFeature = 'filter';
    renderOriginalCanvas();

    const rawData = canvasCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
    const filtered = applySobelFilter(rawData);
    canvasCtx.putImageData(filtered, 0, 0);

    showResultsPanel(
      'Edge & Document Filter',
      `
      <div class="result-item">
        <p>Applied Sobel Convolution gradient filter.</p>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button class="btn btn-secondary btn-sm" id="btnApplyBinarize">
            High-Contrast B&W Scan
          </button>
        </div>
      </div>
    `
    );

    document.getElementById('btnApplyBinarize')?.addEventListener('click', () => {
      renderOriginalCanvas();
      const freshData = canvasCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
      const binarized = applyDocumentScanFilter(freshData);
      canvasCtx.putImageData(binarized, 0, 0);
      showToast('Binarized document scan applied!');
    });

    showToast('Applied Sobel edge detection filter!');
  });

  // Feature: EXIF Metadata Inspector
  btnInspectExif.addEventListener('click', () => {
    state.activeFeature = 'exif';
    renderOriginalCanvas();

    if (!state.exifData) {
      showResultsPanel(
        'Camera EXIF Metadata',
        '<div class="result-item">No EXIF header tags found. (Screenshots, clipboard pastes, and webcam snapshots usually do not contain EXIF metadata).</div>'
      );
      showToast('No EXIF metadata in this image.');
      return;
    }

    const m = state.exifData;
    const items = [
      m.make || m.model ? `<strong>Device:</strong> ${m.make || ''} ${m.model || ''}` : null,
      m.lensModel ? `<strong>Lens:</strong> ${m.lensModel}` : null,
      m.fNumber ? `<strong>Aperture:</strong> f/${m.fNumber}` : null,
      m.exposureTime ? `<strong>Exposure:</strong> 1/${Math.round(1 / m.exposureTime)}s` : null,
      m.iso ? `<strong>ISO:</strong> ${m.iso}` : null,
      m.focalLength ? `<strong>Focal Length:</strong> ${m.focalLength}mm` : null,
      m.dateTimeOriginal ? `<strong>Captured:</strong> ${new Date(m.dateTimeOriginal).toLocaleString()}` : null,
      m.latitude && m.longitude ? `<strong>GPS:</strong> ${m.latitude.toFixed(4)}, ${m.longitude.toFixed(4)}` : null,
    ].filter(Boolean);

    const html = items.length > 0
      ? items.map((it) => `<div class="result-item">${it}</div>`).join('')
      : '<div class="result-item">Basic image with no extended EXIF tags.</div>';

    showResultsPanel('Camera EXIF Metadata', html);
    showToast('Loaded EXIF metadata!');
  });
}
