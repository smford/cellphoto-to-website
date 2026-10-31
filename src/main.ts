import QRCode from 'qrcode';
import { WebRTCReceiver, WebRTCSender } from './services/webrtc';
import { CameraManager } from './services/camera';
import { detectFaces } from './services/faceDetector';
import { detectBarcodes } from './services/qrDetector';
import { detectObjects } from './services/objectDetector';
import { extractPaletteFromImageData } from './services/colorExtractor';
import { applySobelFilter, applyDocumentScanFilter, pixelateFaces, drawFaceCircles, type DetectedFace } from './services/imageFilters';
import { extractPhotoMetadata, type PhotoMetadata } from './services/exifReader';

// UI State
interface AppState {
  originalImage: HTMLImageElement | null;
  currentPhotoDataUrl: string | null;
  detectedFaces: DetectedFace[];
  exifData: PhotoMetadata | null;
  activeFeature: string | null;
  privacyBlurEnabled: boolean;
}

const state: AppState = {
  originalImage: null,
  currentPhotoDataUrl: null,
  detectedFaces: [],
  exifData: null,
  activeFeature: 'faces',
  privacyBlurEnabled: false,
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
// 2. MOBILE REMOTE CAMERA MODE
// --------------------------------------------------------------------------
async function initMobileRemoteMode(sessionId: string) {
  desktopApp.style.display = 'none';
  mobileRemoteApp.style.display = 'flex';

  const remotePeerStatus = document.getElementById('remotePeerStatus')!;
  const mobileCameraVideo = document.getElementById('mobileCameraVideo') as HTMLVideoElement;
  const btnMobileShutter = document.getElementById('btnMobileShutter')!;
  const btnMobileFlipCamera = document.getElementById('btnMobileFlipCamera')!;
  const mobileFileInput = document.getElementById('mobileFileInput') as HTMLInputElement;
  const mobileTransferOverlay = document.getElementById('mobileTransferOverlay')!;
  const mobileTransferProgress = document.getElementById('mobileTransferProgress')!;

  // 1. Initialize mobile camera (rear camera ideal)
  try {
    await cameraManager.start(mobileCameraVideo, 'environment');
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
      const snapshot = cameraManager.captureSnapshot(mobileCameraVideo);
      await sendImage(snapshot);
    } catch (e) {
      console.error(e);
      alert('Could not capture photo. Try choosing from camera roll.');
    }
  });

  btnMobileFlipCamera.addEventListener('click', async () => {
    await cameraManager.toggleCamera(mobileCameraVideo);
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
      webrtcStatusText.textContent = 'P2P Ready';

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
  state.activeFeature = 'faces';
  state.privacyBlurEnabled = false;

  // Show studio view, hide source selection
  sourceSelectionSection.style.display = 'none';
  studioSection.style.display = 'flex';

  // Read EXIF metadata asynchronously
  extractPhotoMetadata(sourceFile || dataUrl).then((meta) => {
    state.exifData = meta;
  });

  // Load image onto Canvas
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = async () => {
    state.originalImage = img;

    photoCanvas.width = img.naturalWidth || img.width;
    photoCanvas.height = img.naturalHeight || img.height;

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
        state.detectedFaces.map(
          (f, idx) =>
            `<div class="result-item">
              <strong>Face #${idx + 1}</strong>: ${Math.round(f.confidence * 100)}% confidence
              <br><span style="font-size: 0.75rem; color: #94a3b8;">Bounds: [${Math.round(f.boundingBox.x)}, ${Math.round(f.boundingBox.y)}, ${Math.round(f.boundingBox.width)} × ${Math.round(f.boundingBox.height)}]</span>
            </div>`
        ).join('')
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
  const btnPrivacyBlur = document.getElementById('btnPrivacyBlur')!;
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
    btnPrivacyBlur.classList.remove('active');
    btnDetectFace.classList.remove('active');
    renderOriginalCanvas();
    showToast('Reset to original photo.');
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
    btnDetectFace.classList.add('active');
    if (state.detectedFaces.length === 0) {
      await runFaceDetection();
    } else {
      redrawCanvas();
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

  // Feature: QR & Barcode Detection
  btnDetectQR.addEventListener('click', async () => {
    state.activeFeature = 'qr';
    renderOriginalCanvas();
    showCanvasLoading('Scanning for QR codes & barcodes...');

    try {
      const barcodes = await detectBarcodes(photoCanvas, canvasCtx);
      if (barcodes.length > 0) {
        showToast(`Discovered ${barcodes.length} barcode/QR code!`);

        // Draw bounding boxes on canvas
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

        // Draw bounding boxes & labels
        objects.forEach((obj, idx) => {
          const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];
          const color = colors[idx % colors.length];

          canvasCtx.save();
          canvasCtx.strokeStyle = color;
          canvasCtx.lineWidth = 3;
          canvasCtx.strokeRect(obj.boundingBox.x, obj.boundingBox.y, obj.boundingBox.width, obj.boundingBox.height);

          // Label
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
    // Apply Sobel or Document Scan
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
