// MediaPipe hand tracking plus the helpers both cams use to draw on top of
// the mirrored, cover-cropped video.

import { HandLandmarker, FilesetResolver } from
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// tries the GPU first and falls back to the CPU (some laptops/browsers
// refuse the GPU delegate). resolves to { detect, delegate }
export async function loadHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  let lastError;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      return {
        delegate,
        detect(video) {
          const result = landmarker.detectForVideo(video, performance.now());
          return {
            hands: result.landmarks ?? [],
            labels: (result.handedness ?? result.handednesses ?? []).map((h) => h?.[0]?.categoryName ?? ''),
          };
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// landmark indices: 0 wrist, then 4 per digit from thumb to pinky
const DIGITS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
export const BONES = [
  ...DIGITS.flatMap((digit) => [[0, digit[0]], ...digit.slice(1).map((joint, k) => [digit[k], joint])])
    .filter(([a, b]) => !(a === 0 && (b === 9 || b === 13))),   // middle/ring hang off the knuckle row
  [5, 9], [9, 13], [13, 17],
];

export const distance = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);

// wrist to middle knuckle: a stable "size of this hand" to normalise against
export const handLength = (hand, aspect = 1) => distance(hand[0], hand[9], aspect);

// size a full-window canvas to the screen's pixel density. returns the ratio used
export function fitToWindow(canvas) {
  const ratio = Math.min(window.devicePixelRatio, 2);
  const w = Math.round(window.innerWidth * ratio);
  const h = Math.round(window.innerHeight * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return ratio;
}

// video landmark (0..1, unmirrored) -> canvas pixel, matching the stage's
// mirror + cover crop so dots land on your fingers
export function screenMapper(canvas, coverScale) {
  return (point) => [
    (0.5 + (0.5 - point.x) / coverScale.x) * canvas.width,
    (0.5 + (point.y - 0.5) / coverScale.y) * canvas.height,
  ];
}

export function drawBones(context, hands, toScreen, lineWidth) {
  context.save();
  context.globalAlpha = 0.5;
  context.lineWidth = lineWidth;
  context.beginPath();
  for (const hand of hands) {
    for (const [a, b] of BONES) {
      context.moveTo(...toScreen(hand[a]));
      context.lineTo(...toScreen(hand[b]));
    }
  }
  context.stroke();
  context.restore();
}

export function drawLabel(context, text, x, y, { font, ratio, align = 'center' }) {
  context.save();
  context.font = font.replace(/(\d+)px/, (_, px) => `${Math.round(px * ratio)}px`);
  context.textAlign = align;
  context.shadowColor = 'rgba(0,0,0,.4)';
  context.shadowBlur = 4 * ratio;
  context.fillText(text, x, y);
  context.restore();
}
