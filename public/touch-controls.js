// Safari can expose its own pinch gesture even with a fixed viewport.
// Leave desktop trackpad gestures, normal taps and scrolling untouched.
if (window.matchMedia('(any-pointer: coarse)').matches) {
  const preventGestureZoom = event => {
    if (event.cancelable) event.preventDefault();
  };
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, preventGestureZoom, { passive: false });
  }
}
