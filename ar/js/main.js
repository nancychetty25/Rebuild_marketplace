// ============================================================================
// main.js
// Structure AR - Application Entry Point
// Handles:
// - Landing screen
// - 3D Preview
// - WebXR AR
// - Model placement
// - Selection and interaction
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { MODELS } from './config.js';
import { ModelManager } from './model-manager.js';
import { InteractionManager } from './interaction-manager.js';
import { ARController } from './ar.js';
import { UIManager } from './ui.js';
import { MeasurementManager, MeasurementVisuals } from './measurement.js';
import { FitChecker, FitResult } from './fit-checker.js';
import { CaptureManager } from './capture-manager.js';

// ============================================================================
// DOM
// ============================================================================

const viewport = document.getElementById('viewport');
const gestureCatcher = document.getElementById('gesture-catcher');

// ============================================================================
// THREE.JS RENDERER
// ============================================================================

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  // Required so CaptureManager's canvas.toBlob() screenshot reads back the
  // actual last-rendered frame instead of a blank/garbage buffer — WebGL is
  // otherwise free to clear the drawing buffer right after compositing.
  // Small perf cost; acceptable for this app's model counts.
  preserveDrawingBuffer: true,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// WebXR support
renderer.xr.enabled = true;

viewport.appendChild(renderer.domElement);

// ============================================================================
// SCENE
// ============================================================================

const scene = new THREE.Scene();

// Lighting
const hemiLight = new THREE.HemisphereLight(
  0xffffff,
  0x445566,
  1.1
);

scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(
  0xffffff,
  1.4
);

dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// ============================================================================
// PREVIEW CAMERA
// ============================================================================

const previewCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

previewCamera.position.set(
  2.4,
  1.8,
  2.8
);

// ============================================================================
// ORBIT CONTROLS
// ============================================================================

const previewControls = new OrbitControls(
  previewCamera,
  gestureCatcher
);

previewControls.target.set(0, 0.4, 0);

previewControls.enableDamping = true;
previewControls.dampingFactor = 0.08;

previewControls.minDistance = 0.5;
previewControls.maxDistance = 12;

previewControls.maxPolarAngle = Math.PI * 0.49;

previewControls.enabled = false;

previewControls.update();

// ============================================================================
// PREVIEW GRID
// ============================================================================

const previewGrid = new THREE.GridHelper(
  20,
  40,
  0x2d6cdf,
  0xc7d0da
);

previewGrid.material.opacity = 0.5;
previewGrid.material.transparent = true;
previewGrid.visible = false;

scene.add(previewGrid);

// ============================================================================
// WINDOW RESIZE
// ============================================================================

window.addEventListener('resize', () => {
  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  previewCamera.aspect =
    window.innerWidth / window.innerHeight;

  previewCamera.updateProjectionMatrix();
});

// ============================================================================
// APPLICATION MANAGERS
// ============================================================================

const ui = new UIManager();

const modelManager = new ModelManager(scene);

const interaction = new InteractionManager(
  scene,
  modelManager
);

const arController = new ARController(
  renderer,
  scene,
  ui.el.overlay
);

const measurement = new MeasurementManager();
const measurementVisuals = new MeasurementVisuals(scene);
const fitChecker = new FitChecker();
const capture = new CaptureManager(renderer);

// ============================================================================
// APPLICATION STATE
// ============================================================================

let currentMode = 'landing';
let selectedModelId = null;

// ---- ReBuild Vision marketplace deep-link: ar/index.html?model=brick&product=Reclaimed%20Bricks&back=%23p-bricks-0
const urlParams = new URLSearchParams(location.search);
const presetModel = MODELS[urlParams.get('model')] ? urlParams.get('model') : null;
const presetName = (urlParams.get('product') || '').slice(0, 80);
const backHash = /^#[\w~.-]*$/.test(urlParams.get('back') || '') ? urlParams.get('back') : '';

function applyPreset() {
  if (!presetModel) return;
  selectedModelId = presetModel;
  ui.setSelectedToolbarItem(presetModel);
}

(function setupShopContext() {
  const ctx = document.getElementById('product-context');
  if (ctx && presetModel) {
    ctx.textContent = `${presetName ? presetName + ' — ' : ''}shown with the “${MODELS[presetModel].name}” 3D model.`;
    ctx.hidden = false;
  }
  const back = document.getElementById('btn-back-shop');
  if (back && (presetModel || urlParams.has('back'))) {
    back.href = '../index.html' + backHash;
    back.hidden = false;
  }
})();

// ============================================================================
// ACTIVE CAMERA
// ============================================================================

function getActiveCamera() {
  if (currentMode === 'ar') {
    return arController.getCamera();
  }

  if (currentMode === 'preview') {
    return previewCamera;
  }

  return null;
}

// ============================================================================
// MODEL PLACEMENT
// ============================================================================

async function attemptPlacement(ndcX, ndcY) {

  // ----------------------------------------------------------
  // MEASUREMENT MODE TAKES PRIORITY
  // ----------------------------------------------------------
  // While the Will It Fit? measurement flow is active, an "empty tap"
  // (one that didn't hit an existing placed object) commits a measurement
  // point instead of placing a new model.
  if (measurement.isActive()) {
    handleMeasurementTap(ndcX, ndcY);
    return;
  }

  if (!selectedModelId) {
    ui.showToast(
      'Select a component from the toolbar first.'
    );

    return;
  }

  // ----------------------------------------------------------
  // AR MODE
  // ----------------------------------------------------------

  if (currentMode === 'ar') {

    const pose = arController.getReticlePose();

    if (!pose) {

      ui.showToast(
        'Move your phone slowly to detect a surface first.'
      );

      return;
    }

    try {

      ui.setLoading(
        true,
        `Loading ${MODELS[selectedModelId].name}…`
      );

      const camera = getActiveCamera();
      const cameraForward = camera
        ? camera.getWorldDirection(new THREE.Vector3())
        : null;

      await interaction.placeModel(
        selectedModelId,
        pose.position,
        pose.quaternion,
        cameraForward
      );

    } catch (error) {

      console.error(error);

      ui.showToast(
        'Unable to place the selected model.'
      );

    } finally {

      ui.setLoading(false);
    }

    return;
  }

  // ----------------------------------------------------------
  // 3D PREVIEW MODE
  // ----------------------------------------------------------

  if (currentMode === 'preview') {

    const point = interaction.raycastGround(
      ndcX,
      ndcY,
      previewCamera,
      0
    );

    if (!point) {
      return;
    }

    try {

      ui.setLoading(
        true,
        `Loading ${MODELS[selectedModelId].name}…`
      );

      const cameraForward = previewCamera.getWorldDirection(new THREE.Vector3());

      // The 3D Preview ground is always flat, so its "hit pose" is simply
      // world-up — computePlacementTransform (via placeModel) then
      // classifies this as a floor hit exactly like a real AR floor
      // hit-test result would be.
      await interaction.placeModel(
        selectedModelId,
        point,
        new THREE.Quaternion(),
        cameraForward
      );

    } catch (error) {

      console.error(error);

      ui.showToast(
        'Unable to load the selected model.'
      );

    } finally {

      ui.setLoading(false);
    }
  }
}

// ============================================================================
// MEASUREMENT TAP HANDLING
// ============================================================================
// AR: reuses the same viewer-centered reticle the placement flow already
// uses (see measurement.js's top comment for why — this app has no
// per-touch-point AR hit-testing wired up, only the single always-forward
// reticle, so "tap to record a point" records wherever that reticle
// currently is, exactly like tapping to place a model does).
// 3D Preview: raycasts the actual tap location against the ground plane,
// since real per-tap raycasting is available there.
async function handleMeasurementTap(ndcX, ndcY) {

  let point = null;

  if (currentMode === 'ar') {
    // ROOT CAUSE (AR measurement points not landing where you tap): this
    // used to record the center-of-screen reticle position, ignoring
    // where the finger actually touched — so two taps without moving the
    // phone produced two nearly identical points. Now a hit test is cast
    // through the exact tapped screen position (see ar.js).
    const hit = await arController.hitTestAtScreenPoint(ndcX, ndcY);

    // The measurement may have been cancelled/reset (or AR exited) while
    // the async hit test was in flight.
    if (!measurement.isActive() || currentMode !== 'ar') {
      return;
    }

    if (!hit) {
      ui.showToast(
        'No surface found there. Tap on a detected wall or floor (e.g. the edge of the opening), not empty space.'
      );
      return;
    }

    point = hit.position;

  } else if (currentMode === 'preview') {

    point = interaction.raycastGround(ndcX, ndcY, previewCamera, 0);

    if (!point) {
      return;
    }
  } else {
    return;
  }

  measurementVisuals.addMarker(point);

  const completed = measurement.addPoint(point);

  if (completed) {

    if (completed.points.length === 2) {
      measurementVisuals.addLine(completed.points[0], completed.points[1]);
    }

    ui.updateFitOpening(measurement.getResult());

    ui.showToast(
      `${completed.mode === 'width' ? 'Width' : 'Height'}: ${completed.distance.toFixed(2)} m`
    );

  } else {

    ui.setInstruction(
      measurement.mode === 'width'
        ? 'Tap the second point to finish measuring width.'
        : 'Tap the second point to finish measuring height.'
    );
  }
}

// ============================================================================
// GESTURES
// ============================================================================

interaction.attachGestures(
  gestureCatcher,
  {
    getCamera: getActiveCamera,

    isMeasuring: () => measurement.isActive(),

    onEmptyTap: (ndcX, ndcY) => {
      attemptPlacement(ndcX, ndcY);
    },
  }
);

// ============================================================================
// SELECTION CHANGE
// ============================================================================

interaction.on(
  'selectionChange',
  (record) => {

    previewControls.enabled =
      currentMode === 'preview' && !record;

    ui.updateSelectionPanel(record);

    ui.setMoveButtonActive(
      interaction.moveModeActive
    );

    if (currentMode === 'ar') {

      if (record) {

        ui.setInstruction(null);

      } else if (
        arController.hasValidReticle()
      ) {

        ui.setInstruction(
          selectedModelId
            ? `Tap to place ${MODELS[selectedModelId].name}`
            : 'Select a component below to place it.'
        );

      } else {

        ui.setInstruction(
          'Move your phone slowly to detect a surface.'
        );
      }
    }
  }
);

// ============================================================================
// OBJECT CHANGES
// ============================================================================

interaction.on(
  'objectsChange',
  () => {
    // Reserved for future object count / status updates.
  }
);

// ============================================================================
// SCENE RESET (fired by both Reset and Clear Scene — see
// interaction-manager.js resetScene()/clearAll()). Fit and measurement
// state live outside InteractionManager, so they're cleared here rather
// than inside it.
// ============================================================================

interaction.on(
  'sceneReset',
  () => {
    measurement.reset();
    measurementVisuals.clear();
    ui.updateFitOpening(measurement.getResult());
    ui.showFitResult(null);
    ui.updateFitTarget(null);
  }
);

// ============================================================================
// MODEL LOAD ERROR
// ============================================================================

interaction.on(
  'loadError',
  (message) => {

    ui.setLoading(false);

    ui.showToast(message);
  }
);

// ============================================================================
// TOOLBAR
// ============================================================================

ui.buildToolbar(
  (modelId) => {

    selectedModelId = modelId;

    ui.setSelectedToolbarItem(modelId);

    if (currentMode === 'ar') {

      ui.setInstruction(
        arController.hasValidReticle()
          ? `Tap to place ${MODELS[modelId].name}`
          : 'Move your phone slowly to detect a surface.'
      );

    } else if (currentMode === 'preview') {

      ui.setInstruction(
        `Tap the ground to place ${MODELS[modelId].name}`
      );
    }
  }
);

// ============================================================================
// ADD BRICK
// ============================================================================

ui.el.btnAddBrick.addEventListener(
  'click',
  () => {

    selectedModelId = 'brick';

    ui.setSelectedToolbarItem('brick');

    ui.showToast(
      'Brick selected — tap a surface to place another.'
    );
  }
);

// ============================================================================
// CLEAR SCENE
// ============================================================================

// Shared "is there actually anything to clear" check for Reset and Clear
// Scene. ROOT CAUSE of the "yellow measurement lines survive a reset" bug:
// both buttons' guards only checked interaction.list().length (placed
// objects) — if you'd taken a measurement but never placed anything, the
// scene "looked" empty by that check alone and the whole reset/clear was
// skipped early, before it ever reached the code that clears the
// measurement visuals. Checking measurement state too closes that gap.
function sceneHasAnythingToClear() {
  return (
    interaction.list().length > 0 ||
    !!interaction.getSelected() ||
    measurement.isActive() ||
    measurement.hasOpening()
  );
}

ui.el.btnClearScene.addEventListener(
  'click',
  async () => {

    if (!sceneHasAnythingToClear()) {
      ui.showToast('Scene is already empty.');
      return;
    }

    const ok = await ui.confirm(
      'Remove all placed components?'
    );

    if (ok) {
      // Was interaction.clearAll() — that removes placed objects but
      // does NOT fire 'sceneReset', which is the only thing that tells
      // main.js to also clear the measurement markers/lines and fit
      // panel state (see the 'sceneReset' listener above). Clear Scene
      // and Reset now both go through the exact same full cleanup path.
      interaction.resetScene();
    }
  }
);

// ============================================================================
// SELECTION PANEL
// ============================================================================

ui.el.btnPanelClose.addEventListener(
  'click',
  () => {
    interaction.clearSelection();
  }
);

// MOVE
ui.el.btnMove.addEventListener(
  'click',
  () => {

    const active =
      interaction.setMoveMode(
        !interaction.moveModeActive
      );

    ui.setMoveButtonActive(active);

    ui.showToast(
      active
        ? 'Move armed — drag anywhere to move the object.'
        : 'Move off.'
    );
  }
);

// ROTATE
ui.el.btnRotate.addEventListener(
  'click',
  () => {

    interaction.rotateSelected(
      THREE.MathUtils.degToRad(22.5)
    );

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// SCALE UP
ui.el.btnScaleUp.addEventListener(
  'click',
  () => {

    interaction.scaleSelectedBy(1.1);

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// SCALE DOWN
ui.el.btnScaleDown.addEventListener(
  'click',
  () => {

    interaction.scaleSelectedBy(1 / 1.1);

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// DUPLICATE
ui.el.btnDuplicate.addEventListener(
  'click',
  async () => {

    try {

      ui.setLoading(
        true,
        'Duplicating…'
      );

      await interaction.duplicateSelected();

    } catch (error) {

      console.error(error);

      ui.showToast(
        'Unable to duplicate the component.'
      );

    } finally {

      ui.setLoading(false);
    }
  }
);

// RESET TRANSFORM (per-object — puts the selected object back to how it
// looked when it was placed; distinct from the whole-scene Reset button).
ui.el.btnResetObject.addEventListener(
  'click',
  () => {

    interaction.resetSelected();

    ui.updateSelectionPanel(
      interaction.getSelected()
    );
  }
);

// DELETE
//
// Per the spec: if nothing is selected, show a message and don't crash.
// (Previously this button silently did nothing when nothing was selected,
// since deleteSelected() early-returns on !rec — now it also tells the
// user why.)
ui.el.btnDelete.addEventListener(
  'click',
  async () => {

    if (!interaction.getSelected()) {
      ui.showToast('Select an object to delete.');
      return;
    }

    const ok = await ui.confirm(
      'Delete selected component?'
    );

    if (ok) {
      interaction.deleteSelected();
    }
  }
);

// RESET (whole scene — instant, no confirmation; see interaction-manager.js
// resetScene() for why this is now a full-scene action rather than a
// per-object one).
ui.el.btnResetScene.addEventListener(
  'click',
  () => {
    // Previously this silently did nothing when the scene was already
    // empty — no toast, no visible change at all. On a real device that
    // looks EXACTLY like a broken button, since the person has no way to
    // tell "there was nothing to reset" apart from "the tap didn't
    // register." Always give feedback. Also previously only checked
    // placed objects, not measurement state — see sceneHasAnythingToClear()
    // above for why that let stranded measurement markers survive a reset.
    if (!sceneHasAnythingToClear()) {
      ui.showToast('Scene is already empty.');
      return;
    }

    interaction.resetScene();

    ui.showToast('Scene reset.');
  }
);

// ============================================================================
// WILL IT FIT?
// ============================================================================

function refreshFitTargetDisplay() {
  const rec = interaction.getSelected();

  if (!rec) {
    ui.updateFitTarget(null);
    return;
  }

  const config = MODELS[rec.modelId];

  ui.updateFitTarget({
    name: config.name,
    type: config.type,
    dimensions: config.dimensions,
  });
}

function runFitCheck() {
  const rec = interaction.getSelected();

  if (!rec) {
    ui.showFitResult(
      { result: FitResult.UNCERTAIN, reason: 'Select a placed component first.' },
      FitResult
    );
    return;
  }

  const rotationDeg = THREE.MathUtils.radToDeg(rec.group.rotation.y);
  const opening = measurement.getResult();

  const report = fitChecker.checkFit(rec.modelId, opening, rotationDeg);

  ui.showFitResult(report, FitResult);
}

ui.el.btnFitToggle.addEventListener('click', () => {
  refreshFitTargetDisplay();
  ui.updateFitOpening(measurement.getResult());
  ui.showFitResult(null);
  ui.showFitPanel(true);
});

ui.el.btnFitClose.addEventListener('click', () => {
  if (measurement.isActive()) {
    measurement.cancel();
    ui.setInstruction(null);
  }
  ui.showFitPanel(false);
});

ui.el.btnMeasureWidth.addEventListener('click', () => {
  if (currentMode === 'landing') {
    ui.showToast('Start AR or 3D Preview first.');
    return;
  }
  measurement.start('width');
  ui.showFitPanel(false);
  ui.setInstruction('Tap the first point to measure width.');
});

ui.el.btnMeasureHeight.addEventListener('click', () => {
  if (currentMode === 'landing') {
    ui.showToast('Start AR or 3D Preview first.');
    return;
  }
  measurement.start('height');
  ui.showFitPanel(false);
  ui.setInstruction('Tap the first point to measure height.');
});

measurement.on('measurementComplete', () => {
  ui.setInstruction(null);
  ui.showFitPanel(true);
});

ui.el.btnCheckFit.addEventListener('click', runFitCheck);

ui.el.btnFitRotate.addEventListener('click', () => {
  interaction.rotateSelected(THREE.MathUtils.degToRad(90));
  ui.updateSelectionPanel(interaction.getSelected());
  runFitCheck();
});

ui.el.btnFitReset.addEventListener('click', () => {
  measurement.reset();
  measurementVisuals.clear();
  ui.updateFitOpening(measurement.getResult());
  ui.showFitResult(null);
});

// Keep the fit panel's target in sync whenever the selection changes while
// it's open (e.g. the user taps a different placed object).
interaction.on('selectionChange', () => {
  if (ui.isFitPanelOpen()) {
    refreshFitTargetDisplay();
  }
});

// ============================================================================
// CAPTURE: PHOTO
// ============================================================================
// In AR mode this is delegated to arController, which reads the actual XR
// frame's rendered pixels directly off the GPU (see ar.js) — a plain
// canvas.toBlob() doesn't work here because WebXR presents each frame
// through its own compositor path, bypassing the canvas's regular
// drawing buffer entirely (this is also why video recording, which relies
// on captureStream() reading that same regular buffer, was removed for AR
// — there was no equivalent workaround available for a continuous stream,
// only for single-frame capture).

ui.el.btnPhoto.addEventListener('click', async () => {
  if (currentMode === 'landing') {
    ui.showToast('Start AR or 3D Preview first.');
    return;
  }

  try {
    const result = await capture.capturePhoto(
      undefined,
      currentMode === 'ar' ? arController : null
    );

    ui.showToast(
      result && result.includesCamera === false
        ? 'Photo saved, but this device did not share the camera image — only the placed objects appear.'
        : 'Photo saved.',
      result && result.includesCamera === false ? 5000 : 2600
    );
  } catch (error) {
    console.error(error);
    ui.showToast(error.message || 'Unable to capture a photo.');
  }
});

// ============================================================================
// 3D PREVIEW MODE
// ============================================================================


function enterPreview() {

  console.log('Entering 3D Preview');

  currentMode = 'preview';

  selectedModelId = null;

  interaction.clearSelection();

  ui.setMode('preview');

  applyPreset();
  ui.setInstruction(
    presetModel
      ? `Tap the ground to place ${MODELS[presetModel].name}`
      : 'Select a component, then tap the ground to place it.'
  );

  previewControls.enabled = true;

  previewGrid.visible = true;

  renderer.setAnimationLoop(
    previewLoop
  );
}

// ============================================================================
// EXIT TO LANDING
// ============================================================================

function exitToLanding() {

  console.log('Returning to landing screen');

  currentMode = 'landing';

  selectedModelId = null;

  // ROOT CAUSE (persistence bug — "objects are still there after exiting
  // and reopening"): this used to call interaction.clearSelection(), which
  // only deselects — it never removed placed objects from the scene or
  // from InteractionManager's `objects` map. Since neither enterAR() nor
  // enterPreview() cleared them either, every previously placed object
  // just sat in the THREE.Scene indefinitely, resurfacing (or, in AR,
  // resurfacing at the WRONG position — each AR session gets its own local
  // reference space, so stale objects placed under a previous session's
  // reference space land in an arbitrary spot) the next time a session
  // started. There is no localStorage/sessionStorage/IndexedDB anywhere in
  // this codebase — this was purely an in-memory scene-graph leak across
  // mode transitions, not disk persistence.
  interaction.resetScene();

  ui.showFitPanel(false);

  ui.setSelectedToolbarItem(null);

  ui.setMode('landing');

  ui.setInstruction(null);

  previewControls.enabled = false;

  previewGrid.visible = false;

  renderer.setAnimationLoop(null);
}

// ============================================================================
// PREVIEW RENDER LOOP
// ============================================================================

function previewLoop() {

  previewControls.update();

  renderer.render(
    scene,
    previewCamera
  );
}

// ============================================================================
// WEBXR AR
// ============================================================================

async function enterAR() {

  ui.showArSupportNote(null);

  const supported =
    await ARController.isSupported();

  if (!supported) {

    ui.showUnsupportedModal(true);

    return;
  }

  try {

    currentMode = 'ar';

    selectedModelId = null;

    interaction.clearSelection();

    previewControls.enabled = false;

    previewGrid.visible = false;

    ui.setMode('ar');

    applyPreset();

    ui.setInstruction(
      'Move your phone slowly to detect a surface.'
    );

    await arController.start();

  } catch (error) {

    console.error(
      'AR start error:',
      error
    );

    currentMode = 'landing';

    ui.setMode('landing');

    ui.showUnsupportedModal(true);
  }
}

// ============================================================================
// AR SESSION END
// ============================================================================

arController.on(
  'onSessionEnd',
  () => {

    // The XR session can end via the OS/browser back-gesture as well as
    // our own Exit button, so this path needs the exact same cleanup as
    // exitToLanding() — not a partial copy of it — or stale placed objects
    // could survive into the next AR session via this route instead.
    if (currentMode === 'ar') {

      exitToLanding();
    }
  }
);

// ============================================================================
// AR RETICLE UPDATE
// ============================================================================

arController.on(
  'onReticleUpdate',
  (visible) => {

    if (
      currentMode !== 'ar' ||
      interaction.getSelected()
    ) {
      return;
    }

    if (!visible) {

      ui.setInstruction(
        'Move your phone slowly to detect a surface.'
      );

    } else {

      ui.setInstruction(
        selectedModelId
          ? `Tap to place ${MODELS[selectedModelId].name}`
          : 'Select a component below to place it.'
      );
    }
  }
);

// ============================================================================
// MAIN BUTTONS
// ============================================================================

ui.el.btnStartAr.addEventListener(
  'click',
  enterAR
);

ui.el.btn3dPreview.addEventListener(
  'click',
  () => {
    console.log('3D Preview button clicked');
    enterPreview();
  }
);

ui.el.btnHelp.addEventListener(
  'click',
  () => {
    ui.showHelp(true);
  }
);

ui.el.btnHelpClose.addEventListener(
  'click',
  () => {
    ui.showHelp(false);
  }
);

ui.el.btnHelpToggle.addEventListener(
  'click',
  () => {
    ui.showHelp(true);
  }
);

// ============================================================================
// EXIT BUTTON
// ============================================================================

ui.el.btnExit.addEventListener(
  'click',
  async () => {

    if (currentMode === 'ar') {

      await arController.stop();
    }

    exitToLanding();
  }
);

// ============================================================================
// UNSUPPORTED AR MODAL
// ============================================================================

// IMPORTANT:
// We also attach directly to the actual DOM element.
// This makes the preview button work even if UIManager's
// element mapping has a problem.

const unsupportedPreviewButton =
  document.getElementById('unsupported-preview');

if (unsupportedPreviewButton) {

  unsupportedPreviewButton.addEventListener(
    'click',
    () => {

      console.log(
        'Open 3D Preview clicked'
      );

      ui.showUnsupportedModal(false);

      enterPreview();
    }
  );
}

const unsupportedCloseButton =
  document.getElementById('unsupported-close');

if (unsupportedCloseButton) {

  unsupportedCloseButton.addEventListener(
    'click',
    () => {

      ui.showUnsupportedModal(false);
    }
  );
}

// ============================================================================
// STARTUP
// ============================================================================

(async () => {

  try {

    const supported =
      await ARController.isSupported();

    if (!supported) {

      ui.showArSupportNote(
        'AR isn’t supported on this browser/device. Start AR will offer the 3D Preview instead.'
      );
    }

  } catch (error) {

    console.warn(
      'Unable to check AR support:',
      error
    );
  }

})();