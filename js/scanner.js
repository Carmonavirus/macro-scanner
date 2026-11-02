// Camera barcode scanner.
// Uses Chrome's built-in BarcodeDetector on Android when it supports EAN codes,
// otherwise a ZXing WebAssembly build (vendored, so it also works offline).

import { isValidGtin } from './nutrition.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let detectorPromise;

async function loadPonyfill() {
  if (!window.BarcodeDetectionAPI) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/barcode-detector-ponyfill.js', import.meta.url).href;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the barcode reader.'));
      document.head.appendChild(s);
    });
  }
  const api = window.BarcodeDetectionAPI;
  api.prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) =>
        path.endsWith('.wasm') ? new URL('../vendor/zxing_reader.wasm', import.meta.url).href : prefix + path,
    },
    fireImmediately: true,
  });
  return new api.BarcodeDetector({ formats: FORMATS });
}

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes('ean_13')) {
        return new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
      }
    } catch { /* fall through to WASM */ }
  }
  return loadPonyfill();
}

export function getDetector() {
  if (!detectorPromise) detectorPromise = createDetector();
  return detectorPromise;
}

/** UPC-A codes are EAN-13 codes with a leading 0 – OFF stores the 13-digit form. */
function normaliseCode(raw) {
  const code = String(raw).replace(/\D/g, '');
  return code.length === 12 ? `0${code}` : code;
}

export class Scanner {
  constructor(video, { onDetected, onError }) {
    this.video = video;
    this.onDetected = onDetected;
    this.onError = onError;
    this.stream = null;
    this.running = false;
    this.lastCode = null;
    this.hits = 0;
  }

  async start() {
    const detector = await getDetector();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.lastCode = null;
    this.hits = 0;
    this.loop(detector);
  }

  async loop(detector) {
    while (this.running) {
      try {
        if (this.video.readyState >= 2) {
          const results = await detector.detect(this.video);
          const code = results.map((r) => normaliseCode(r.rawValue)).find(isValidGtin);
          if (code) {
            // Require two identical reads in a row to rule out misreads.
            this.hits = code === this.lastCode ? this.hits + 1 : 1;
            this.lastCode = code;
            if (this.hits >= 2) {
              if (navigator.vibrate) navigator.vibrate(80);
              this.stop();
              this.onDetected(code);
              return;
            }
          }
        }
      } catch (err) {
        this.stop();
        this.onError(err);
        return;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  get torchSupported() {
    const track = this.stream?.getVideoTracks()[0];
    return !!track?.getCapabilities?.().torch;
  }

  async setTorch(on) {
    const track = this.stream?.getVideoTracks()[0];
    if (track) await track.applyConstraints({ advanced: [{ torch: on }] });
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
