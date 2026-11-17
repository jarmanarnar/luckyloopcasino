// Embla 8.6 reInit normally jumps to the selected snap. Preserve the displayed
// distance to that snap while responsive card widths are being interpolated.
// Keep this adapter isolated: it relies on the pinned vendor's engine vectors.
export function resizeHeroCarousel(api, entries, { animate = true } = {}) {
  const before = api.internalEngine();
  const container = api.containerNode();
  const slides = api.slideNodes();
  const changed = entries.some(({ target }) => {
    const rect = target === container ? before.containerRect : before.slideRects[slides.indexOf(target)];
    return rect && Math.abs(target.offsetWidth - rect.width) >= .5;
  });
  if (!changed) return false;

  const oldStep = Math.abs(before.scrollSnaps[1] - before.scrollSnaps[0]) || before.containerRect.width;
  const distance = before.target.get() - before.offsetLocation.get();
  const remaining = oldStep > 0 ? distance / oldStep : 0;
  api.reInit();

  if (animate && Math.abs(distance) > .5 && Number.isFinite(remaining)) {
    const after = api.internalEngine();
    const newStep = Math.abs(after.scrollSnaps[1] - after.scrollSnaps[0]) || after.containerRect.width;
    const position = after.target.get() - remaining * newStep;
    after.location.set(position);
    after.offsetLocation.set(position);
    after.previousLocation.set(position);
    if (after.options.loop) after.slideLooper.loop();
    after.translate.to(position);
    after.animation.start();
  }
  api.emit('resize');
  // We performed the remeasurement; suppress Embla's second, snapping reInit.
  return false;
}
