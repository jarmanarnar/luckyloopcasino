import { ACCOUNT_DATABASE, ACCOUNT_KEY } from './demo-account-state.js';

export async function openAccountStore({ indexedDB = globalThis.indexedDB, name = ACCOUNT_DATABASE, create } = {}) {
  if (!indexedDB) throw new Error('Persistent demo account storage is unavailable.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore('accounts', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Please close older demo tabs and reload.')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      resolve(request.result);
    };
  });
  db.onversionchange = () => db.close();
  function transact(update) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('accounts', 'readwrite');
      const store = transaction.objectStore('accounts');
      let outcome, failure;
      const request = store.get(ACCOUNT_KEY);
      request.onsuccess = () => {
        try {
          const current = request.result;
          outcome = current ? update(current) : { account: create(), result: { ok: true } };
          if (!current || outcome.account !== current) store.put(outcome.account);
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(outcome);
      transaction.onabort = () => reject(failure || transaction.error || new Error('The demo account could not be saved.'));
      transaction.onerror = () => { failure ||= transaction.error; };
    });
  }
  function read() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('accounts', 'readonly');
      const request = transaction.objectStore('accounts').get(ACCOUNT_KEY);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error('The demo account could not be read.'));
    });
  }
  try { await transact(account => ({ account, result: { ok: true } })); }
  catch (error) { db.close(); throw error; }
  return { read, transact, close: () => db.close() };
}
