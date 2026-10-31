export async function waitForPageAssets(doc) {
  // Lazy provider marks also belong to the current page. Start their requests
  // behind the loader instead of letting them appear after the page is shown.
  const images = [...doc.images].filter(image => image.getClientRects().length);
  for (const image of images) image.loading = 'eager';
  await Promise.all([doc.fonts?.ready, ...images.map(image => image.decode())]);
}

function layoutSnapshot(doc) {
  const elements = [doc.body, ...doc.querySelectorAll('body > :not(#app-loader):not(script), body > :not(#app-loader):not(script) *')];
  return elements.filter(element => element.getClientRects().length).map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x, y, width, height].map(value => Math.round(value * 100) / 100).join(',');
  }).join('|');
}

export function waitForStableLayout(doc, scope, { quietTime = 200, timeout = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    let frame, previous, stableSince;
    const timer = scope.setTimeout(() => {
      scope.cancelAnimationFrame(frame);
      reject(new Error('Application layout did not settle'));
    }, timeout);
    function measure(now) {
      const snapshot = layoutSnapshot(doc);
      if (snapshot !== previous) { previous = snapshot; stableSince = now; }
      if (now - stableSince >= quietTime) {
        scope.clearTimeout(timer);
        resolve();
      } else frame = scope.requestAnimationFrame(measure);
    }
    frame = scope.requestAnimationFrame(measure);
  });
}
