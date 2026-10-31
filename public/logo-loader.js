export const LOGO_MOTION = Object.freeze({ duration: 1800, tail: .25, color: '#eeeef2' });

export function initLogoLoader({ document: doc = document, window: scope = window } = {}) {
  const brand = doc.querySelector('#app-loader-brand');
  const source = doc.querySelector('#app-loader-source');
  const canvas = doc.querySelector('#app-loader-logo');
  const context = canvas?.getContext('2d');
  if (!brand || !source || !context) return { ready: Promise.resolve(), stop() {} };

  const motion = scope.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion.matches || doc.body.dataset.reduceMotion === 'true';
  let stopped = false, frame = null, previousTime = null, phase = .24;
  let loopMask, wordmark, layer;
  const makeCanvas = (width, height) => {
    const result = doc.createElement('canvas');
    result.width = width; result.height = height;
    return result;
  };
  const raw = [{ x: 46, y: 186 }], distances = [0];
  for (const curve of [
    [46, 104, 116, 46, 195, 46], [284, 46, 335, 126, 392, 186],
    [451, 249, 506, 324, 587, 324], [666, 324, 735, 268, 735, 186],
    [735, 104, 666, 46, 587, 46], [506, 46, 451, 126, 392, 186],
    [335, 249, 284, 324, 195, 324], [116, 324, 46, 268, 46, 186],
  ]) {
    const start = raw[raw.length - 1];
    for (let i = 1; i <= 256; i++) {
      const t = i / 256, s = 1 - t;
      const next = {
        x: s*s*s*start.x + 3*s*s*t*curve[0] + 3*s*t*t*curve[2] + t*t*t*curve[4],
        y: s*s*s*start.y + 3*s*s*t*curve[1] + 3*s*t*t*curve[3] + t*t*t*curve[5],
      };
      const last = raw[raw.length - 1];
      distances.push(distances[distances.length - 1] + Math.hypot(next.x - last.x, next.y - last.y));
      raw.push(next);
    }
  }
  const length = distances[distances.length - 1];
  function point(fraction) {
    const distance = ((fraction % 1) + 1) % 1 * length;
    let low = 0, high = distances.length - 1;
    while (high - low > 1) {
      const middle = (high + low) >> 1;
      if (distances[middle] < distance) low = middle; else high = middle;
    }
    const t = (distance - distances[low]) / (distances[high] - distances[low]);
    return { x: raw[low].x + (raw[high].x - raw[low].x) * t,
      y: raw[low].y + (raw[high].y - raw[low].y) * t };
  }
  function mask(x, width) {
    const result = makeCanvas(width, 373);
    const ctx = result.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, x, 216, width, 373, 0, 0, width, 373);
    const pixels = ctx.getImageData(0, 0, width, 373);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const brightness = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.max(0, Math.min(255, (brightness - 18) * 255 / 237));
    }
    ctx.putImageData(pixels, 0, 0);
    return result;
  }
  function draw(still = reduced()) {
    if (!wordmark) return;
    const { width, height } = brand.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(scope.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.scale(width / 1416, height / 373);
    context.drawImage(wordmark, 0, 0);
    if (still) return;
    context.clearRect(292, 0, 782, 373);
    const flow = layer.getContext('2d');
    flow.globalCompositeOperation = 'source-over';
    flow.clearRect(0, 0, 782, 373);
    flow.fillStyle = flow.strokeStyle = LOGO_MOTION.color;
    flow.globalAlpha = .24;
    flow.fillRect(0, 0, 782, 373);
    flow.lineCap = flow.lineJoin = 'round';
    let last = point(phase - LOGO_MOTION.tail);
    for (let i = 1; i <= 240; i++) {
      const t = i / 240, next = point(phase - LOGO_MOTION.tail + LOGO_MOTION.tail * t);
      flow.lineWidth = 8 + 108 * Math.pow(t, .65);
      flow.globalAlpha = .06 + .94 * Math.pow(t, .65);
      flow.beginPath(); flow.moveTo(last.x, last.y); flow.lineTo(next.x, next.y); flow.stroke();
      last = next;
    }
    flow.globalAlpha = 1;
    flow.globalCompositeOperation = 'destination-in';
    flow.drawImage(loopMask, 0, 0);
    flow.globalCompositeOperation = 'source-over';
    context.drawImage(layer, 292, 0);
  }
  function cancelFrame() {
    if (frame !== null) scope.cancelAnimationFrame(frame);
    frame = previousTime = null;
  }
  function tick(now) {
    frame = null;
    if (stopped || doc.hidden || reduced()) return;
    if (previousTime !== null) phase = (phase + Math.min(now - previousTime, 50) / LOGO_MOTION.duration) % 1;
    previousTime = now;
    draw(false);
    frame = scope.requestAnimationFrame(tick);
  }
  function syncMotion() {
    cancelFrame();
    if (stopped || !wordmark) return;
    draw();
    if (!doc.hidden && !reduced()) frame = scope.requestAnimationFrame(tick);
  }
  const resize = new scope.ResizeObserver(() => draw());
  const ready = source.decode().then(() => {
    if (stopped) return;
    loopMask = mask(542, 782);
    wordmark = mask(250, 1416);
    const tint = wordmark.getContext('2d');
    tint.globalCompositeOperation = 'source-in';
    tint.fillStyle = LOGO_MOTION.color; tint.fillRect(0, 0, 1416, 373);
    tint.globalCompositeOperation = 'source-over';
    layer = makeCanvas(782, 373);
    canvas.hidden = false;
    source.hidden = true;
    resize.observe(brand);
    motion.addEventListener('change', syncMotion);
    doc.addEventListener('visibilitychange', syncMotion);
    doc.addEventListener('loop:preferences-change', syncMotion);
    syncMotion();
  });
  return {
    ready,
    stop() {
      stopped = true;
      cancelFrame();
      resize.disconnect();
      motion.removeEventListener('change', syncMotion);
      doc.removeEventListener('visibilitychange', syncMotion);
      doc.removeEventListener('loop:preferences-change', syncMotion);
      draw(true);
    },
  };
}
