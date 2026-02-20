import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAkGusTXxtMF0aVkvvswhw0oUaBMDg4zRs",
  authDomain: "arrivio-271aa.firebaseapp.com",
  projectId: "arrivio-271aa",
  storageBucket: "arrivio-271aa.firebasestorage.app",
  messagingSenderId: "262026810996",
  appId: "1:262026810996:web:3f558583945403d4a0a321",
  measurementId: "G-XG5Q7LSSPH"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
