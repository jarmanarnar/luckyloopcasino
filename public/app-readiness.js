export function waitForAppStyles(doc) {
  const pending = new Set(doc.querySelectorAll('link[data-app-styles]'));
  if (!pending.size) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const listeners = new Map();
    let finished = false;
    function cleanup(link) {
      const handlers = listeners.get(link);
      if (!handlers) return;
      link.removeEventListener('load', handlers.load);
      link.removeEventListener('error', handlers.error);
      listeners.delete(link);
    }
    function settle(link, failed = false) {
      if (finished || !pending.has(link)) return;
      cleanup(link);
      pending.delete(link);
      link.dataset.styleState = failed ? 'error' : 'loaded';
      if (failed) {
        finished = true;
        for (const remaining of pending) cleanup(remaining);
        reject(new Error(`Unable to load stylesheet: ${link.getAttribute('href')}`));
      } else {
        link.media = 'all';
        if (!pending.size) { finished = true; resolve(); }
      }
    }
    for (const link of pending) {
      const handlers = { load: () => settle(link), error: () => settle(link, true) };
      listeners.set(link, handlers);
      link.addEventListener('load', handlers.load);
      link.addEventListener('error', handlers.error);
    }
    // The link's inline handlers remember errors before bootstrap arrives.
    // sheet also covers a cached load whose event has already been delivered.
    for (const link of [...pending]) {
      if (link.dataset.styleState === 'error') settle(link, true);
      else if (link.dataset.styleState === 'loaded' || link.sheet) settle(link);
    }
  });
}

export function waitForPageAssets(doc, scope = globalThis, { timeout = 600 } = {}) {
  // Images already reserve their geometry. Let their normal loading and error
  // fallbacks work without turning artwork into a prerequisite for opening the app.
  if (!doc.fonts) return Promise.resolve();
  const fonts = [Promise.resolve().then(() => doc.fonts.ready)];
  if (typeof doc.fonts.load === 'function') {
    for (const weight of [400, 500, 600, 700, 800]) {
      fonts.push(Promise.resolve().then(() => doc.fonts.load(`${weight} 16px Poppins`)));
    }
  }
  return new Promise(resolve => {
    const finish = () => { scope.clearTimeout(timer); resolve(); };
    const timer = scope.setTimeout(finish, timeout);
    // The wallet also remeasures when fonts arrive after this short grace period.
    Promise.allSettled(fonts).then(finish);
  });
}

function layoutSnapshot(doc) {
  const elements = [doc.body, ...doc.querySelectorAll('body > :not(#app-loader):not(script), body > :not(#app-loader):not(script) *')];
  return elements.filter(element => element.getClientRects().length).map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x, y, width, height].map(value => Math.round(value * 100) / 100).join(',');
  }).join('|');
}

export function waitForStableLayout(doc, scope, { quietTime = 200, timeout = 1_000 } = {}) {
  if (doc.hidden) return Promise.resolve();
  return new Promise(resolve => {
    let frame, previous, stableSince, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      scope.clearTimeout(timer);
      scope.cancelAnimationFrame(frame);
      resolve();
    };
    const timer = scope.setTimeout(finish, timeout);
    function measure(now) {
      if (finished) return;
      if (doc.hidden) { finish(); return; }
      const snapshot = layoutSnapshot(doc);
      if (snapshot !== previous) { previous = snapshot; stableSince = now; }
      if (now - stableSince >= quietTime) {
        finish();
      } else frame = scope.requestAnimationFrame(measure);
    }
    frame = scope.requestAnimationFrame(measure);
  });
}
