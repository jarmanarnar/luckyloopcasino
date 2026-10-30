// Values are display coins; the caller supplies GC/SC formatting per transition.
export function createWalletCounter({
  onFrame,
  format = String,
  duration = 500,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
  now = () => performance.now(),
}) {
  let value = 0;
  let target = 0;
  let formatter = format;
  let frame = null;
  let revision = 0;

  function stop() {
    revision += 1;
    if (frame !== null) cancelFrame(frame);
    frame = null;
  }

  function emit() {
    onFrame(formatter(value), value);
  }

  function immediate(next, nextFormatter = formatter) {
    stop();
    value = target = next;
    formatter = nextFormatter;
    emit();
  }

  function animateTo(next, nextFormatter = formatter) {
    stop();
    target = next;
    formatter = nextFormatter;
    if (duration <= 0 || value === target) {
      immediate(target, formatter);
      return;
    }
    const from = value;
    const started = now();
    const run = revision;
    emit();
    if (run !== revision) return;

    function tick() {
      if (run !== revision) return;
      frame = null;
      const progress = Math.max(0, Math.min(1, (now() - started) / duration));
      value = progress === 1 ? target : from + (target - from) * (1 - (1 - progress) ** 3);
      emit();
      if (run === revision && progress < 1) frame = requestFrame(tick);
    }
    frame = requestFrame(tick);
  }

  return {
    immediate,
    animateTo,
    cancel() { stop(); target = value; },
    finish() { immediate(target, formatter); },
    get value() { return value; },
  };
}
