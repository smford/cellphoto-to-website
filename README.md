# CellPhoto Studio 📸

[![Deploy to GitHub Pages](https://github.com/smford/cellphoto-to-website/actions/workflows/deploy.yml/badge.svg)](https://github.com/smford/cellphoto-to-website/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> A modern, zero-backend, client-side web application hosted on **GitHub Pages**. Explore how photos can be acquired by a browser—including instant, encrypted **peer-to-peer WebRTC DataChannel transfer from a phone or tablet**—and what computer vision and AI detections can run directly in the user's browser.

🔗 **Live Application**: [https://smford.github.io/cellphoto-to-website/](https://smford.github.io/cellphoto-to-website/) (or [http://stephenford.org/cellphoto-to-website/](http://stephenford.org/cellphoto-to-website/))

---

## ✨ Key Capabilities

### 1. Photo Acquisition (3 Modalities)
- **Computer File Upload**: Drag-and-drop zone, file browser, and global clipboard paste (`Ctrl+V` / `Cmd+V`) supporting JPG, PNG, WebP, AVIF, and HEIC.
- **Computer Webcam**: Integrated camera viewfinder with front/back camera flipping, 3-second countdown timer, and snapshot capture.
- **Phone / Tablet Remote (WebRTC P2P DataChannel)**:
  - Generates a QR code containing an encrypted room session.
  - Scanning the QR code on a mobile device or tablet opens a dedicated touch-friendly mobile camera remote.
  - Photos are chunked and transmitted in real-time directly over an encrypted WebRTC SCTP DataChannel (DTLS-SRTP end-to-end encrypted) straight onto your desktop canvas. No photos touch any server or cloud storage!

### 2. In-Browser Computer Vision & Detections
All detections run **100% locally on the client machine** using WebAssembly, WebGL, and browser APIs:
- 🎯 **Face Detection & Circular Reticles**:
  - Automatically identifies faces using MediaPipe Tasks Vision and the native Shape Detection API.
  - Draws glowing circular reticles and boundary circles around discovered faces with confidence metrics and key landmark points (eyes, nose, mouth).
  - **Privacy Face Blur**: One-click pixelation/anonymization filter for detected faces.
- 📱 **QR & Barcode Scanning**:
  - Decodes QR codes, Data Matrix, UPC/EAN, and Code 128 from photos using native `BarcodeDetector` with `jsQR` fallback.
  - Displays decoded URLs/text with one-click copy to clipboard.
- 🏷️ **Object Detection**:
  - Recognizes common everyday objects (people, laptops, mobile phones, chairs, cups, etc.) with localized bounding boxes.
- 🎨 **Dominant Color Palette Extractor**:
  - Runs in-browser k-means clustering to compute the top 6 dominant colors, their distribution percentage, and hex codes.
- 📄 **Document Scanner & Sobel Edge Convolution**:
  - Applies a 3x3 Sobel convolution gradient filter or adaptive thresholding to convert photos into crisp scanned documents.
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

### Prerequisites
- Node.js >= 18
- npm >= 9

### Quick Start
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

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production
```bash
npm run build
npm run preview
```

---

## 🔒 Privacy & Security

- **Zero Cloud Image Storage**: Photos never leave your devices or get stored on a server.
- **Peer-to-Peer Encryption**: Remote photo transfer between mobile device and desktop occurs directly over peer-to-peer WebRTC connections secured with DTLS (Datagram Transport Layer Security) and SRTP.
- **In-Browser Processing**: All AI detection models, convolution filters, and metadata parsing execute in client-side memory.

---

## 📄 License
MIT License. Created by Stephen Ford.
