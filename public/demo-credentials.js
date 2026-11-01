// Local demo credentials only. Real accounts require a server authentication provider.
// Passwords never enter the account snapshot, activity log or browser storage as text.
const iterations = 120000;
export function normalizeDemoEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
export function validDemoEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
async function digest(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(salt),
    iterations, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits));
}
export async function createDemoCredential(password) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await digest(password, salt) };
}
export async function matchesDemoCredential(password, credential) {
  if (!Array.isArray(credential?.salt) || !Array.isArray(credential?.hash) || credential.hash.length !== 32) return false;
  const candidate = await digest(password, credential.salt);
  return candidate.reduce((difference, value, index) => difference | (value ^ credential.hash[index]), 0) === 0;
}
