// ============================================================================
// ar.js
// Real WebXR immersive-ar handling: session request/teardown, hit-test
// source, reference spaces, the placement reticle, and per-frame updates.
// No fake camera-feed-plus-CSS trickery — this only runs when
// navigator.xr reports genuine 'immersive-ar' support.
// ============================================================================

import * as THREE from 'three';
import { CAPTURE_CONFIG } from './config.js';

export class ARController {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {HTMLElement} overlayRoot - DOM element used as the WebXR dom-overlay root.
   */
  constructor(renderer, scene, overlayRoot) {
    this.renderer = renderer;
    this.scene = scene;
    this.overlayRoot = overlayRoot;

    this.session = null;
    this.hitTestSource = null;
    this.viewerSpace = null;
    this.localSpace = null;
    this.reticle = this._buildReticle();
    this.reticleVisible = false;

    // renderer.xr.getCamera() only returns a correctly-populated camera
    // AFTER renderer.render(scene, <a camera>) has run at least once per
    // frame. That "a camera" is this reference camera — its own transform
    // is irrelevant during an XR session (WebXR supplies the real pose),
    // but its near/far planes are copied into the XR camera, so keep them
    // sensible for a handheld AR scale.
    this._referenceCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);

    this.callbacks = {
      onSessionStart: () => {},
      onSessionEnd: () => {},
      onReticleUpdate: () => {},
      onFrame: () => {},
    };

    this._onSessionEnded = this._onSessionEnded.bind(this);
    this._renderLoop = this._renderLoop.bind(this);

    // --- Raw camera access (real camera image for photos) ---
    this.cameraAccessGranted = false;
    this._glBinding = null;
    this._camFbo = null;
    this._camTexture = null;
    this._camWidth = 0;
    this._camHeight = 0;
    this._camProgram = null;
    this._camSampler = null;

    // --- Per-tap hit tests (see hitTestAtScreenPoint() below) ---
    this._pendingHitTests = []; // { source, resolve, framesLeft }

    // --- Frame capture (see captureFrame() below) ---
    this._pendingCapture = null; // { resolve, reject } while a photo request is in flight
    this._resolveFbo = null;     // plain (non-multisampled) framebuffer used to resolve the XR layer's frame
    this._resolveTexture = null;
    this._resolveWidth = 0;
    this._resolveHeight = 0;
    this._captureCanvas = null;  // reused 2D canvas the resolved pixels get drawn into
    this._captureCtx = null;
  }

  on(name, fn) {
    this.callbacks[name] = fn;
  }

  /** Feature-detects real WebXR immersive-ar support. Never assumes support. */
  static async isSupported() {
    if (!('xr' in navigator)) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch (err) {
      return false;
    }
  }

  async start() {
    if (!('xr' in navigator)) {
      throw new Error('WebXR is not available in this browser.');
    }
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error('immersive-ar is not supported on this device/browser.');
    }

    this.session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'anchors', 'camera-access'],
      domOverlay: this.overlayRoot ? { root: this.overlayRoot } : undefined,
    });

    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(this.session);

    this.viewerSpace = await this.session.requestReferenceSpace('viewer');
    this.hitTestSource = await this.session.requestHitTestSource({ space: this.viewerSpace });
    this.localSpace = this.renderer.xr.getReferenceSpace();

    // Optional features are silently dropped if unsupported/denied, so
    // check what was really enabled instead of assuming.
    this.cameraAccessGranted = !!this.session.enabledFeatures?.includes('camera-access');
    console.info('[AR] camera-access granted:', this.cameraAccessGranted);

    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.session.addEventListener('end', this._onSessionEnded);
    this.renderer.setAnimationLoop(this._renderLoop);

    this.callbacks.onSessionStart();
  }

  async stop() {
    if (this.session) {
      await this.session.end().catch(() => {});
    }
  }

  _onSessionEnded() {
    this.session?.removeEventListener('end', this._onSessionEnded);
    this.renderer.setAnimationLoop(null);
    this.scene.remove(this.reticle);
    this.reticleVisible = false;
    this.hitTestSource = null;
    this.viewerSpace = null;
    this.localSpace = null;
    this.session = null;

    // Any per-tap hit test still waiting on a frame can never resolve now.
    this._pendingHitTests.forEach(({ source, resolve }) => {
      try { source.cancel(); } catch (e) { /* session already gone */ }
      resolve(null);
    });
    this._pendingHitTests = [];

    if (this._pendingCapture) {
      this._pendingCapture.reject(new Error('AR session ended before the photo could be captured.'));
      this._pendingCapture = null;
    }

    this._disposeCaptureResources();
    this._glBinding = null;
    this.cameraAccessGranted = false;

    this.callbacks.onSessionEnd();
  }

  _renderLoop(timestamp, frame) {
    if (frame && this.hitTestSource && this.localSpace) {
      const results = frame.getHitTestResults(this.hitTestSource);
      if (results.length > 0) {
        const pose = results[0].getPose(this.localSpace);
        if (pose) {
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);
          this.reticle.matrix.decompose(this.reticle.position, this.reticle.quaternion, this.reticle.scale);
          if (!this.reticleVisible) {
            this.reticleVisible = true;
            this.callbacks.onReticleUpdate(true);
          }
        }
      } else if (this.reticleVisible) {
        this.reticleVisible = false;
        this.reticle.visible = false;
        this.callbacks.onReticleUpdate(false);
      }
    }

    // Resolve any per-tap hit tests requested since the last frame. A
    // hit-test source created mid-frame only starts returning results on
    // a following frame, so each request is polled for a few frames
    // before giving up (resolving null = "no surface under that tap").
    if (frame && this._pendingHitTests.length > 0 && this.localSpace) {
      this._pendingHitTests = this._pendingHitTests.filter((entry) => {
        const results = frame.getHitTestResults(entry.source);

        if (results.length > 0) {
          const pose = results[0].getPose(this.localSpace);

          if (pose) {
            entry.source.cancel();
            const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            matrix.decompose(position, quaternion, new THREE.Vector3());
            entry.resolve({ position, quaternion });
            return false;
          }
        }

        entry.framesLeft -= 1;

        if (entry.framesLeft <= 0) {
          entry.source.cancel();
          entry.resolve(null);
          return false;
        }

        return true;
      });
    }

    this.callbacks.onFrame(timestamp, frame);
    this.renderer.render(this.scene, this._referenceCamera);

    // Must happen HERE, immediately after this frame's render call and
    // still inside the XR frame callback — see captureFrame()'s comment
    // for why waiting until the requesting click handler resumes (even a
    // tick later) is too late.
    if (this._pendingCapture) {
      const { resolve, reject } = this._pendingCapture;
      this._pendingCapture = null;
      try {
        resolve(this._readFrameToDataUrl(frame));
      } catch (err) {
        reject(err);
      }
    }
  }

  isPresenting() {
    return !!this.session;
  }

  hasValidReticle() {
    return this.isPresenting() && this.reticleVisible;
  }

  getReticlePose() {
    if (!this.hasValidReticle()) return null;
    return {
      position: this.reticle.position.clone(),
      quaternion: this.reticle.quaternion.clone(),
    };
  }

  /** Camera to use for raycasting placed objects while an AR session is active. */
  getCamera() {
    return this.isPresenting() ? this.renderer.xr.getCamera() : null;
  }

  // ==========================================================================
  // PER-TAP HIT TEST
  //
  // The single hit-test source started in start() is locked to the CENTER
  // of the view (the reticle) — it says nothing about where a finger
  // touched. Using the reticle for "tap two points to measure" meant both
  // points were recorded wherever the phone happened to be pointing at
  // tap time, so two taps without moving the phone gave two near-identical
  // points (and every fit check failed).
  //
  // Here the tap's normalized screen position is unprojected through the
  // XR view's projection matrix into a ray direction in viewer space, and
  // a one-shot hit-test source is created with that offsetRay — so the
  // result is the real-world surface actually under the finger.
  //
  // Limitation (inherent to hit-testing): the ray must hit a DETECTED
  // surface. Tapping empty space (e.g. the open gap of a doorway) returns
  // null; tap the wall/floor edges around the opening instead.
  // ==========================================================================

  /**
   * @param {number} ndcX  -1..1, left to right
   * @param {number} ndcY  -1..1, bottom to top
   * @returns {Promise<{position:THREE.Vector3, quaternion:THREE.Quaternion}|null>}
   */
  async hitTestAtScreenPoint(ndcX, ndcY) {
    if (!this.isPresenting() || !this.viewerSpace) return null;

    const xrCamera = this.renderer.xr.getCamera();
    const viewCamera = xrCamera.cameras?.[0] || xrCamera;

    const direction = new THREE.Vector3(ndcX, ndcY, 0.5)
      .applyMatrix4(viewCamera.projectionMatrix.clone().invert())
      .normalize();

    const ray = new XRRay(
      new DOMPoint(0, 0, 0, 1),
      new DOMPoint(direction.x, direction.y, direction.z, 0)
    );

    let source;

    try {
      source = await this.session.requestHitTestSource({
        space: this.viewerSpace,
        offsetRay: ray,
      });
    } catch (err) {
      console.error('[AR] per-tap hit test unavailable:', err);
      return null;
    }

    return new Promise((resolve) => {
      this._pendingHitTests.push({ source, resolve, framesLeft: 12 });
    });
  }

  // ==========================================================================
  // FRAME CAPTURE ("attempt the XRWebGLBinding-style partial capture")
  //
  // WHY THIS IS NEEDED AT ALL: during a normal (non-XR) render, Three.js
  // draws into the <canvas> element's OWN regular framebuffer — exactly
  // what canvas.toBlob()/captureStream() read from. Once an immersive-ar
  // session starts, WebXR redirects rendering into a SEPARATE compositor
  // framebuffer (the session's XRWebGLLayer) that the browser presents
  // directly to the display; the canvas's regular framebuffer just sits
  // stale for the session's duration. That's the root cause of the
  // blank-photo bug — there's nothing in the canvas's own buffer to read.
  //
  // THE FIX: read pixels directly out of the XR layer's own framebuffer
  // (session.renderState.baseLayer.framebuffer) via WebGL2's
  // blitFramebuffer + readPixels, from INSIDE the XR frame callback where
  // that framebuffer is guaranteed to hold this frame's freshly rendered
  // content. The blit-to-a-plain-framebuffer step is required because
  // this app's renderer requests antialiasing, so the XR layer's color
  // buffer is very likely a multisampled renderbuffer — WebGL forbids
  // readPixels directly against a multisampled attachment.
  //
  // HONEST LIMITATION: this captures whatever THREE.js drew — the placed
  // objects and the reticle — against a transparent/black background. It
  // does NOT include the live real-world camera passthrough. On every
  // platform this was tested against in documentation, that passthrough
  // is composited by the underlying native AR runtime/OS BELOW WebGL's
  // own output, not through any framebuffer JavaScript can read. There is
  // currently no standard web API to capture that passthrough directly —
  // this is a deliberate privacy/security boundary, not an oversight. So:
  // real improvement over "blank", but still not a photo of "your door
  // standing in your actual room."
  // ==========================================================================

  /** @returns {Promise<string>} a PNG data URL of the rendered (objects-only) frame. */
  captureFrame() {
    if (!this.isPresenting()) {
      return Promise.reject(new Error('No active AR session to capture.'));
    }

    if (this._pendingCapture) {
      return Promise.reject(new Error('A photo capture is already in progress.'));
    }

    // Resolved from inside _renderLoop, on the NEXT XR frame — not here —
    // because the layer's framebuffer only reliably holds valid, complete
    // frame content while its frame callback is executing. Resolving from
    // an arbitrary later microtask (e.g. right when the button's click
    // handler runs) risks reading a framebuffer WebXR has already moved
    // past, discarded, or not yet begun drawing into.
    return new Promise((resolve, reject) => {
      this._pendingCapture = { resolve, reject };
    });
  }

  /**
   * Composites the REAL camera image (when the browser grants raw camera
   * access) with the rendered virtual objects, then returns a PNG.
   *
   * WHY THE CAMERA IS MISSING WITHOUT THIS: the live camera background is
   * composited by the OS/browser below WebGL, so reading the XR layer's
   * framebuffer only ever yields the virtual objects. The WebXR "Raw
   * Camera Access" feature (requested as 'camera-access' in start())
   * exposes the camera frame as a GPU texture through
   * XRWebGLBinding.getCameraImage() — valid ONLY inside the frame
   * callback, which is why this runs from _renderLoop.
   *
   * @returns {{dataUrl:string, includesCamera:boolean}}
   */
  _readFrameToDataUrl(frame) {
    const gl = this.renderer.getContext();

    if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
      throw new Error('Photo capture in AR requires WebGL2.');
    }

    const baseLayer = this.session?.renderState?.baseLayer;

    if (!baseLayer) {
      throw new Error('No active XR frame to capture.');
    }

    const width = baseLayer.framebufferWidth;
    const height = baseLayer.framebufferHeight;

    // 1) Virtual objects (with transparency) from the XR layer.
    const virtualPixels = this._readXrLayerPixels(gl, baseLayer, width, height);

    // 2) Real camera image, if the browser granted camera-access.
    let cameraPixels = null;

    if (this.cameraAccessGranted && frame) {
      try {
        cameraPixels = this._readCameraPixels(gl, frame, width, height);
      } catch (err) {
        console.warn('[AR] camera image unavailable, capturing objects only:', err);
      }
    }

    // Our raw GL calls changed bindings/state behind Three.js's back —
    // make it forget its cached state so the next frame renders correctly.
    this.renderer.resetState();

    // 3) Composite on a 2D canvas: camera underneath, objects on top.
    const canvas = this._captureCanvas || (this._captureCanvas = document.createElement('canvas'));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (cameraPixels) {
      ctx.drawImage(this._pixelsToCanvas(cameraPixels, width, height, false), 0, 0);
    } else {
      // No camera image: neutral backdrop so the objects don't sit on
      // transparent "nothing".
      ctx.fillStyle = '#dfe3e8';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(this._pixelsToCanvas(virtualPixels, width, height, true), 0, 0);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      includesCamera: !!cameraPixels,
    };
  }

  /** Resolves (blits) the XR layer into a plain FBO and reads RGBA pixels. */
  _readXrLayerPixels(gl, baseLayer, width, height) {
    this._ensureResolveTargets(gl, width, height);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, baseLayer.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._resolveFbo);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._resolveFbo);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    return pixels;
  }

  /**
   * Fetches this frame's camera texture through XRWebGLBinding and draws it
   * (full-screen) into our own FBO, then reads that back. Drawing via a
   * shader instead of attaching the texture directly avoids relying on
   * the camera texture being framebuffer-attachable.
   */
  _readCameraPixels(gl, frame, width, height) {
    const viewerPose = frame.getViewerPose(this.localSpace);
    const view = viewerPose?.views?.find((v) => v.camera);

    if (!view) {
      throw new Error('No XRView with a camera image this frame.');
    }

    if (typeof XRWebGLBinding === 'undefined') {
      throw new Error('XRWebGLBinding is not available.');
    }

    this._glBinding = this._glBinding || new XRWebGLBinding(this.session, gl);

    const cameraTexture = this._glBinding.getCameraImage(view.camera);

    if (!cameraTexture) {
      throw new Error('getCameraImage returned no texture.');
    }

    this._ensureCameraTargets(gl, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._camFbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);

    gl.useProgram(this._camProgram);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cameraTexture);
    // A sampler overrides filtering/wrap WITHOUT modifying the (opaque,
    // XR-owned) texture — the default min-filter would need mipmaps and
    // sample as black.
    gl.bindSampler(0, this._camSampler);
    gl.uniform1i(gl.getUniformLocation(this._camProgram, 'uTex'), 0);
    gl.uniform1f(gl.getUniformLocation(this._camProgram, 'uFlipY'), CAPTURE_CONFIG.cameraFlipY ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindSampler(0, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return pixels;
  }

  /**
   * Turns bottom-up GL pixels into a top-down canvas. When `unpremultiply`
   * is true, undoes alpha premultiplication (the XR layer is premultiplied)
   * so soft edges of the virtual objects don't come out dark.
   */
  _pixelsToCanvas(pixels, width, height, unpremultiply) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(width, height);
    const rowBytes = width * 4;

    for (let y = 0; y < height; y++) {
      const src = (height - y - 1) * rowBytes;
      const dst = y * rowBytes;
      image.data.set(pixels.subarray(src, src + rowBytes), dst);

      if (unpremultiply) {
        for (let i = dst; i < dst + rowBytes; i += 4) {
          const a = image.data[i + 3];
          if (a > 0 && a < 255) {
            const k = 255 / a;
            image.data[i] = Math.min(255, image.data[i] * k);
            image.data[i + 1] = Math.min(255, image.data[i + 1] * k);
            image.data[i + 2] = Math.min(255, image.data[i + 2] * k);
          }
        }
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  _ensureResolveTargets(gl, width, height) {
    if (this._resolveFbo && this._resolveWidth === width && this._resolveHeight === height) {
      return;
    }

    if (this._resolveFbo) gl.deleteFramebuffer(this._resolveFbo);
    if (this._resolveTexture) gl.deleteTexture(this._resolveTexture);

    this._resolveTexture = this._makeColorTexture(gl, width, height);
    this._resolveFbo = this._makeFbo(gl, this._resolveTexture);
    this._resolveWidth = width;
    this._resolveHeight = height;
  }

  _ensureCameraTargets(gl, width, height) {
    if (!this._camProgram) {
      this._camProgram = this._buildCameraProgram(gl);
      this._camSampler = gl.createSampler();
      gl.samplerParameteri(this._camSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.samplerParameteri(this._camSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(this._camSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(this._camSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    if (this._camFbo && this._camWidth === width && this._camHeight === height) {
      return;
    }

    if (this._camFbo) gl.deleteFramebuffer(this._camFbo);
    if (this._camTexture) gl.deleteTexture(this._camTexture);

    this._camTexture = this._makeColorTexture(gl, width, height);
    this._camFbo = this._makeFbo(gl, this._camTexture);
    this._camWidth = width;
    this._camHeight = height;
  }

  _makeColorTexture(gl, width, height) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  _makeFbo(gl, texture) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  /** Full-screen-triangle shader that just copies the camera texture. */
  _buildCameraProgram(gl) {
    const vert = `#version 300 es
      out vec2 vUv;
      void main() {
        vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
        vUv = pos;
        gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
      }`;

    const frag = `#version 300 es
      precision mediump float;
      uniform sampler2D uTex;
      uniform float uFlipY;
      in vec2 vUv;
      out vec4 outColor;
      void main() {
        vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipY));
        outColor = vec4(texture(uTex, uv).rgb, 1.0);
      }`;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error('Camera shader failed: ' + gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Camera program failed to link: ' + gl.getProgramInfoLog(program));
    }

    return program;
  }

  /** Frees GL capture resources. Safe to call with no active GL context. */
  _disposeCaptureResources(gl = this.renderer?.getContext()) {
    if (!gl) return;
    if (this._resolveFbo) gl.deleteFramebuffer(this._resolveFbo);
    if (this._resolveTexture) gl.deleteTexture(this._resolveTexture);
    if (this._camFbo) gl.deleteFramebuffer(this._camFbo);
    if (this._camTexture) gl.deleteTexture(this._camTexture);
    if (this._camProgram) gl.deleteProgram(this._camProgram);
    if (this._camSampler) gl.deleteSampler(this._camSampler);
    this._resolveFbo = this._resolveTexture = null;
    this._camFbo = this._camTexture = this._camProgram = this._camSampler = null;
    this._resolveWidth = this._resolveHeight = 0;
    this._camWidth = this._camHeight = 0;
  }

  _buildReticle() {
    const geometry = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x2d6cdf, opacity: 0.9, transparent: true });
    const ring = new THREE.Mesh(geometry, material);

    const dotGeometry = new THREE.CircleGeometry(0.012, 24).rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x2d6cdf });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);

    const group = new THREE.Group();
    group.add(ring, dot);
    group.matrixAutoUpdate = false;
    group.visible = false;
    return group;
  }
}