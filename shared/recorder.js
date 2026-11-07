// Records the stage plus any 2D overlay canvases as one video file.
// The layers are flattened onto a hidden canvas every frame; call capture()
// right after rendering (the WebGL canvas is only readable in that frame).

const FORMATS = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export function createRecorder({ layers, filePrefix, indicator }) {
  const flat = document.createElement('canvas');
  const context = flat.getContext('2d');
  let recorder = null;
  let chunks = [];

  function save(type) {
    const file = new Blob(chunks, { type: type || 'video/webm' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `${filePrefix}-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  function toggle() {
    if (recorder) {
      recorder.stop();
      return;
    }
    flat.width = layers[0].width;
    flat.height = layers[0].height;
    const type = FORMATS.find((format) => MediaRecorder.isTypeSupported(format)) ?? '';
    recorder = new MediaRecorder(flat.captureStream(30), { mimeType: type, videoBitsPerSecond: 12_000_000 });
    chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      save(type);
      recorder = null;
      indicator.style.display = 'none';
    };
    recorder.start(250);
    indicator.style.display = 'block';
  }

  function capture() {
    if (!recorder) return;
    for (const layer of layers) context.drawImage(layer, 0, 0, flat.width, flat.height);
  }

  return { toggle, capture };
}
