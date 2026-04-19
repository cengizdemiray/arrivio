// Mock for firebase-auth CDN import
export function getAuth() { return { currentUser: null }; }
export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'mock-uid' } }); }
export function signOut() { return Promise.resolve(); }
export function onAuthStateChanged() { return () => {}; }
