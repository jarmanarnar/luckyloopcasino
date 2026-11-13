export function initSiteMode({ account, document: doc = document }) {
 let current;
 function sync() {
  const mode = account.getSnapshot().wallet.currency === 'SC' ? 'SC' : 'GC';
  if (mode === current) return;
  current = mode;
  doc.body.dataset.siteMode = mode;
  doc.body.dataset.currency = mode;
 }
 sync();
 const unsubscribe = account.subscribe(sync);
 return { getMode: () => current, destroy: () => unsubscribe?.() };
}
