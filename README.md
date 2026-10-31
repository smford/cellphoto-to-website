# CellPhoto Studio 📸

[![Deploy to GitHub Pages](https://github.com/smford/cellphoto-to-website/actions/workflows/deploy.yml/badge.svg)](https://github.com/smford/cellphoto-to-website/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> A zero-backend, client-side web application hosted on **GitHub Pages**. Explore how photos can be acquired by a browser—including instant, encrypted **peer-to-peer WebRTC DataChannel transfer from a phone or tablet with front/rear camera switching**—and explore cutting-edge computer vision and AI detections running 100% locally in-browser.

🔗 **Live Application**: [http://stephenford.org/cellphoto-to-website/](http://stephenford.org/cellphoto-to-website/) (or [https://smford.github.io/cellphoto-to-website/](https://smford.github.io/cellphoto-to-website/))

---

## ✨ Key Capabilities

### 1. Photo Acquisition (3 Modalities)
- **Computer File Upload**: Drag-and-drop zone, file browser, and global clipboard paste (`Ctrl+V` / `Cmd+V`) supporting JPG, PNG, WebP, AVIF, and HEIC.
- **Computer Webcam**: Integrated camera viewfinder with front/back camera flipping, 3-second countdown timer, and snapshot capture.
- **Phone / Tablet Remote (WebRTC P2P DataChannel)**:
  - Generates a QR code containing an encrypted room session.
  - Scanning the QR code on a mobile device or tablet opens an immersive, fullscreen camera remote.
  - **Dynamic Visual Viewport Tracking (`window.visualViewport`)**: Real-time compensation for mobile address bars and OS navigation bars (Android 3-button bar / gesture pill, iOS Home Indicator), completely eliminating scrolling and accidental button clipping.
  - **Proportionate Responsive Touch Controls (`clamp` & `vmin`)**: Touch buttons automatically scale to display size and DPI, providing comfortable, large touch targets on high-res phones and tablets.
  - **Front / Rear Camera Switching**: Easily toggle between the Rear Camera and Front / Selfie Camera directly from the bottom control bar or the header status pill, with automatic selfie mirror preview.
  - Photos are chunked and transmitted in real-time directly over an encrypted WebRTC SCTP DataChannel (DTLS-SRTP end-to-end encrypted) straight onto your desktop canvas. No photos touch any server or cloud storage!

### 2. In-Browser Computer Vision & Detection Showcase
All detections run **100% locally on the client machine** using WebAssembly, WebGL, and browser APIs:
- ✂️ **AI Background Removal & Cutout** *(New)*:
  - Isolates foreground subjects using MediaPipe neural segmentation running in WebAssembly.
  - Strips out background with full alpha transparency (transparent PNG download with checkerboard preview).
  - Studio color backdrop replacements: **Studio White**, **Studio Charcoal**, and **Cyberpunk Blue**.
- 🔄 **Automatic Orientation Normalization & Studio Rotation** *(New)*:
  - Automatically reads EXIF Orientation tags (1..8) to rotate photos taken on smartphones in vertical portrait mode or upside-down.
  - Interactive topbar controls: ↺ 90° CCW and ↻ 90° CW rotation buttons.
- 👁️ **Biometric Eye Detection & Tracking**:
  - Isolate pupil/iris coordinates for both eyes.
  - Calculates **Inter-pupillary distance (IPD)** in pixels and horizontal eye tilt roll angle.
  - Analyzes eye openness state (*Both Eyes Open*, *Winking*, *Closed / Squinting*).
  - Toggles: **Cybernetic Biometric Reticles & Crosshairs**, **Glowing Neon Irises**, and **Eye Privacy Censor Bar**.
- 🎯 **Face Detection & Circular Reticles**:
  - Automatically identifies faces using MediaPipe Tasks Vision and the native Shape Detection API.
  - Draws glowing circular reticles and boundary circles around discovered faces with confidence metrics and key landmark points (eyes, nose, mouth).
  - **Privacy Face Blur**: One-click pixelation/anonymization filter for detected faces.
- 🕶️ **Augmented Reality Face Props**:
  - Automatically aligns and overlays vector accessories onto discovered faces: **Cyberpunk Neon Sunglasses 🕶️**, **Golden Crown 👑**, **Party Hat 🥳**, and **Golden Halo 😇**.
- 📐 **Smart Portrait Avatar Crop (1:1)**:
  - Computes golden-ratio, rule-of-thirds centered 1:1 square profile crops for any detected face with 1-click download.
- 🔍 **Focus Sharpness & Blur Diagnostics (Laplacian Variance)**:
  - Production-grade computer vision sharpness evaluation using 3×3 Laplacian convolution variance.
  - Evaluates focus quality (*"Crisp & Sharp"* vs *"Soft / Motion Blurred"*), exposure grade, and dynamic range histogram.
- 🎨 **Synthetic Portrait Bokeh Lens Blur ($f/1.4$)**:
  - Applies a feathered focal depth-of-field blur outside the detected subject, simulating an open-aperture portrait prime lens.
- 📄 **Optical Text & Receipt Block Detection**:
  - Detects printed and written text zones using horizontal edge gradient density clustering.
- 👁️ **Color Vision Deficiency (Accessibility Simulator)**:
  - Real-time simulation of color blindness: **Deuteranopia** (green-blind), **Protanopia** (red-blind), **Tritanopia** (blue-blind), and **Achromatopsia** (monochromacy).
- 📱 **QR & Barcode Scanning**:
  - Decodes QR codes, Data Matrix, UPC/EAN, and Code 128 from photos using native `BarcodeDetector` with `jsQR` fallback.
- 🏷️ **Everyday Object Detection**:
  - Recognizes common everyday objects (people, laptops, mobile phones, chairs, cups, etc.) with localized bounding boxes.
- 🎨 **Dominant Color Palette Extractor**:
  - In-browser k-means clustering algorithm to compute the top 6 dominant colors, distribution percentage, and hex codes.
- 📄 **Document Scanner & Sobel Edge Convolution**:
  - 3×3 Sobel convolution gradient filter and adaptive document binarization for document capture.
- ℹ️ **EXIF & Camera Metadata Inspector**:
  - Parses camera make, model, lens, exposure time, aperture (f-number), ISO, focal length, capture timestamp, and GPS coordinates via `exifr`.

---

## 🛠️ Tech Stack & SRE Architecture

- **Frontend Core**: TypeScript, Vite, HTML5 Canvas, Modern CSS with custom properties & glassmorphic styling.
- **Real-Time P2P Networking**: WebRTC DataChannels with PeerJS signaling and a resilient chunking protocol.
- **Computer Vision & ML**:
  - `@mediapipe/tasks-vision` (WebAssembly & GPU delegate)
  - Native Browser `FaceDetector` & `BarcodeDetector` APIs
  - `jsQR` (Pure JS QR decoder fallback)
  - `exifr` (High-performance zero-dependency EXIF parser)
- **Continuous Integration & Delivery (CI/CD)**:
  - Automated GitHub Actions workflow (`.github/workflows/deploy.yml`) testing, building, and publishing artifacts directly to GitHub Pages.
  - Automated Release workflow (`.github/workflows/release.yml`) for version tags (`v*`).

---

## 🚀 Local Development

```bash
# Clone the repository
git clone git@github.com:smford/cellphoto-to-website.git
cd cellphoto-to-website

# Install dependencies
npm install

# Run unit tests
npm test

# Start local development server
npm run dev
```

---

## 🔒 Privacy & Security

- **Zero Cloud Image Storage**: Photos never leave your devices or get stored on a server.
- **Peer-to-Peer Encryption**: Remote photo transfer between mobile device and desktop occurs directly over peer-to-peer WebRTC connections secured with DTLS (Datagram Transport Layer Security) and SRTP.
- **In-Browser Processing**: All AI detection models, convolution filters, and metadata parsing execute in client-side memory.

---

## 📄 License
MIT License. Created by Stephen Ford.
