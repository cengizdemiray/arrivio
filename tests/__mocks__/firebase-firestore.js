// Mock for firebase-firestore CDN import
// These are stubs — unit tests for pure functions don't call Firestore,
// but the source files import these at the top level so they must exist.

export function collection() { return {}; }
export function getDocs() { return Promise.resolve({ empty: true, docs: [] }); }
export function getDoc() { return Promise.resolve({ exists: () => false, data: () => ({}) }); }
export function doc() { return {}; }
export function updateDoc() { return Promise.resolve(); }
export function addDoc() { return Promise.resolve({ id: 'mock-id' }); }
export function deleteDoc() { return Promise.resolve(); }
export function setDoc() { return Promise.resolve(); }
export function query() { return {}; }
export function where() { return {}; }
export function orderBy() { return {}; }
export function onSnapshot() { return () => {}; }
export function serverTimestamp() { return new Date(); }
