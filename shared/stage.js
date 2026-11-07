// Three.js stage shared by both cams.
//
// Each frame is built in three passes:
//   1. the effect alone on a transparent target  -> colour + an alpha mask
//   2. the same effect through UnrealBloom       -> colour + glow
//   3. a full-screen shader puts the mirrored webcam underneath both
//
// Doing the webcam in our own shader (instead of a <video> behind a
// transparent canvas) keeps the glow off the video, lets recordings grab
// one canvas, and lets us decode the camera's colours exactly.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const COMPOSITE_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const COMPOSITE_FRAGMENT = /* glsl */`
  uniform sampler2D webcamMap;
  uniform sampler2D effectMap;
  uniform sampler2D glowMap;
  uniform float hasFeed;
  uniform vec2 coverScale;     // object-fit: cover, as a uv scale
  uniform vec2 feedTexel;
  uniform float sharpen;
  uniform float contrast;
  uniform float saturation;
  uniform float night;         // 0..1 how much to darken the room
  uniform float edgeBias;      // how much more the edges darken than the middle
  uniform float additive;      // 1 = effect is light (sparks), 0 = effect is solid (a plant)
  varying vec2 vUv;

  // browsers hand video over already sRGB-encoded. decode it here, exactly,
  // so the output encode at the end gives back the camera's real values
  vec3 toLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }

  vec3 cameraAt(vec2 uv) {
    vec3 c = toLinear(texture2D(webcamMap, uv).rgb);
    if (sharpen > 0.0) {
      vec3 ring = toLinear(texture2D(webcamMap, uv + vec2(feedTexel.x, 0.0)).rgb)
                + toLinear(texture2D(webcamMap, uv - vec2(feedTexel.x, 0.0)).rgb)
                + toLinear(texture2D(webcamMap, uv + vec2(0.0, feedTexel.y)).rgb)
                + toLinear(texture2D(webcamMap, uv - vec2(0.0, feedTexel.y)).rgb);
      c = max(c + sharpen * (4.0 * c - ring), 0.0);
    }
    float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(grey), c, saturation);
    return max((c - 0.18) * contrast + 0.18, 0.0);
  }

  void main() {
    vec3 room = vec3(0.0);
    if (hasFeed > 0.5) {
      vec2 uv = 0.5 + (vec2(1.0 - vUv.x, vUv.y) - 0.5) * coverScale;   // mirrored selfie view
      room = cameraAt(uv);
    }
    float edge = smoothstep(0.15, 0.75, distance(vUv, vec2(0.5, 0.55)));
    room *= 1.0 - night * mix(1.0 - edgeBias, 1.0, edge);

    vec4 effect = texture2D(effectMap, vUv);
    vec3 glow = max(texture2D(glowMap, vUv).rgb - effect.rgb, 0.0);
    float hide = effect.a;
    if (additive > 0.5) {
      // bright light takes over the pixel so colours stay saturated over a white wall
      hide = max(hide, clamp(max(effect.r, max(effect.g, effect.b)) * 0.85, 0.0, 0.95));
    } else {
      // keep the halo around a solid object, not smeared over it
      glow *= 1.0 - 0.75 * effect.a;
    }
    gl_FragColor = vec4(room * (1.0 - hide) + effect.rgb + glow, 1.0);
    #include <colorspace_fragment>
  }`;

export function createStage({ canvas, view, glow, look = {}, shiftStorageKey }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(view.fov, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.fromArray(view.position);

  // drag to orbit, scroll to zoom, right-drag to pan
  const controls = new OrbitControls(camera, canvas);
  controls.target.fromArray(view.lookAt);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  const bufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const effectTarget = new THREE.WebGLRenderTarget(bufferSize.x, bufferSize.y, {
    samples: 4, type: THREE.HalfFloatType });

  const bloom = new EffectComposer(renderer);
  bloom.renderToScreen = false;
  bloom.addPass(new RenderPass(scene, camera));
  bloom.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), glow.strength, glow.radius, glow.threshold));

  const uniforms = {
    webcamMap: { value: null },
    effectMap: { value: effectTarget.texture },
    glowMap: { value: null },
    hasFeed: { value: 0 },
    coverScale: { value: new THREE.Vector2(1, 1) },
    feedTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    sharpen: { value: look.sharpen ?? 0 },
    contrast: { value: look.contrast ?? 1 },
    saturation: { value: look.saturation ?? 1 },
    night: { value: 0 },
    edgeBias: { value: look.edgeBias ?? 0.5 },
    additive: { value: look.additive ? 1 : 0 },
  };
  const composite = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms, vertexShader: COMPOSITE_VERTEX, fragmentShader: COMPOSITE_FRAGMENT,
    depthTest: false, depthWrite: false }));

  // screen-space offset: the effect is drawn off-centre (so your face stays
  // clear) while orbit and zoom still pivot around it
  let shift = view.screenShift;
  try {
    const stored = parseFloat(localStorage.getItem(shiftStorageKey));
    if (Number.isFinite(stored)) shift = stored;
  } catch {}

  function applyShift() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.setViewOffset(w, h, -shift * w, 0, w, h);
  }

  function setShift(value) {
    shift = THREE.MathUtils.clamp(value, -0.45, 0.45);
    applyShift();
    try { localStorage.setItem(shiftStorageKey, String(shift)); } catch {}
  }

  let video = null;
  function fitVideo() {
    if (!video?.videoWidth) return;
    uniforms.feedTexel.value.set(1 / video.videoWidth, 1 / video.videoHeight);
    const screenAspect = window.innerWidth / window.innerHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    if (screenAspect > videoAspect) uniforms.coverScale.value.set(1, videoAspect / screenAspect);
    else uniforms.coverScale.value.set(screenAspect / videoAspect, 1);
  }

  function attachVideo(videoElement) {
    video = videoElement;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.NoColorSpace;   // decoded in the shader, see toLinear
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    uniforms.webcamMap.value = texture;
    uniforms.hasFeed.value = 1;
    video.addEventListener('resize', fitVideo);   // camera switched modes
    fitVideo();
  }

  function render() {
    controls.update();
    renderer.setRenderTarget(effectTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    bloom.render();
    uniforms.glowMap.value = bloom.readBuffer.texture;
    composite.render(renderer);
  }

  window.addEventListener('resize', () => {
    applyShift();
    renderer.setSize(window.innerWidth, window.innerHeight);
    bloom.setSize(window.innerWidth, window.innerHeight);
    renderer.getDrawingBufferSize(bufferSize);
    effectTarget.setSize(bufferSize.x, bufferSize.y);
    fitVideo();
  });
  applyShift();

  return {
    renderer, scene, camera, controls, uniforms, render, attachVideo,
    nudgeShift: (amount) => setShift(shift + amount),
    resetShift: () => setShift(view.screenShift),
    get coverScale() { return uniforms.coverScale.value; },
  };
}
