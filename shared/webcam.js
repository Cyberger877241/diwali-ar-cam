// Webcam handling: opens the camera at the requested mode, prefers a USB
// webcam over the laptop's built-in one, remembers what you pick, and can
// cycle through cameras.

const BUILT_IN = /integrated|built-?in|facetime|internal|front|hd user facing/i;
const STORAGE_KEY = 'arcam.camera';

const remember = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(id) { try { localStorage.setItem(STORAGE_KEY, id); } catch {} },
};

export function createWebcam(video, { width = 1920, height = 1080, fps = 30, preferExternal = true } = {}) {
  let currentId = null;
  let description = '';

  async function open(deviceId) {
    const constraints = {
      width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    const previous = video.srcObject;
    video.srcObject = stream;
    previous?.getTracks().forEach((track) => track.stop());
    await video.play().catch(() => {});

    const track = stream.getVideoTracks()[0];
    // keep autofocus / exposure / white balance live where the camera allows it
    const capabilities = track.getCapabilities?.() ?? {};
    const auto = {};
    for (const setting of ['focusMode', 'exposureMode', 'whiteBalanceMode']) {
      if (capabilities[setting]?.includes('continuous')) auto[setting] = 'continuous';
    }
    if (Object.keys(auto).length) await track.applyConstraints({ advanced: [auto] }).catch(() => {});

    const actual = track.getSettings();
    currentId = actual.deviceId || deviceId || null;
    description = `${track.label || 'camera'} · ${actual.width}×${actual.height}` +
      (actual.frameRate ? ` @ ${Math.round(actual.frameRate)}fps` : '');
  }

  async function listCameras() {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  }

  // resolves once frames are flowing
  async function start() {
    try {
      await open(remember.get());
    } catch (error) {
      if (!remember.get()) throw error;
      await open(null);   // remembered camera is gone, take the default
    }
    // device labels only exist after permission, so choose after the first open
    if (!remember.get() && preferExternal) {
      const cameras = await listCameras();
      const usb = cameras.length > 1 && cameras.find((cam) => cam.label && !BUILT_IN.test(cam.label));
      if (usb && usb.deviceId !== currentId) await open(usb.deviceId).catch(() => {});
    }
    if (video.readyState < 2) await new Promise((done) => video.addEventListener('loadeddata', done, { once: true }));
  }

  async function next() {
    const cameras = await listCameras();
    if (cameras.length < 2) return `${description}  (only one camera found)`;
    const index = cameras.findIndex((cam) => cam.deviceId === currentId);
    const target = cameras[(index + 1) % cameras.length];
    try {
      await open(target.deviceId);
      remember.set(currentId);
      return `${description}  ·  C to switch`;
    } catch (error) {
      return `couldn't open ${target.label || 'that camera'} (${error.name})`;
    }
  }

  return { start, next, get description() { return description; } };
}
