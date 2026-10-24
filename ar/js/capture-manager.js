// ============================================================================
// capture-manager.js
// Photo capture. Video recording was removed entirely (see the app's own
// history: canvas.captureStream() reads the canvas's regular drawing
// buffer, which is exactly what's unavailable during a WebXR session — see
// the AR branch below — and there was no equivalent workaround for a
// continuous stream, only for a single frame, so AR video was never going
// to work and 3D-Preview-only video wasn't worth the remaining complexity).
//
// Two capture paths:
// - 3D Preview (no XR session): plain canvas.toBlob() on the renderer's
//   own <canvas>, which reliably contains the last-rendered frame.
// - AR (active XR session): delegated to ARController.captureFrame() (see
//   ar.js), which reads pixels directly off the XR frame's own GPU
//   framebuffer. This is necessary because WebXR presents each frame
//   through its own compositor path — the canvas's regular drawing buffer
//   sits stale/blank for the session's duration, which is why photos (and
//   the now-removed video) came out blank in real AR. The AR path captures
//   the rendered 3D content (placed objects, reticle) only — see ar.js's
//   own comment for why the live camera passthrough itself is very likely
//   NOT includable via standard web APIs.
// ============================================================================

import { CAPTURE_CONFIG } from './config.js';

export class CaptureManager {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * @param {string} [filename]
   * @param {import('./ar.js').ARController|null} [arController] pass the
   *   active ARController when currently in an AR session; omit/null for
   *   3D Preview.
   * @returns {Promise<Blob|{includesCamera:boolean}>} a Blob for the Preview
   *   path, or { includesCamera } for the AR path (false = the device did
   *   not provide the real camera image, so only virtual objects are shown).
   */
  async capturePhoto(filename = `rebuild-lens-${Date.now()}.png`, arController = null) {
    if (arController?.isPresenting()) {
      const { dataUrl, includesCamera } = await arController.captureFrame();
      this._downloadDataUrl(dataUrl, filename);
      return { includesCamera };
    }

    return new Promise((resolve, reject) => {
      // Requires the renderer to have been created with
      // { preserveDrawingBuffer: true } — otherwise WebGL is free to clear
      // the drawing buffer immediately after compositing, and toBlob()
      // reads back a blank/garbage frame more often than not.
      this.renderer.domElement.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not capture the current frame.'));
          return;
        }
        this._downloadBlob(blob, filename);
        resolve(blob);
      }, CAPTURE_CONFIG.photoMimeType);
    });
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    this._triggerDownload(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  _downloadDataUrl(dataUrl, filename) {
    // Data URLs need no object-URL bookkeeping — the <a download> trick
    // works directly on them.
    this._triggerDownload(dataUrl, filename);
  }

  _triggerDownload(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}