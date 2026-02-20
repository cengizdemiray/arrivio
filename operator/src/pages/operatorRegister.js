// js/pages/operatorRegister.js
import { auth } from '../firebaseClient.js';
import { createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, setDoc, serverTimestamp, getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const db = getFirestore();

const form = document.getElementById('registerForm');
const nameInput = document.getElementById('name');
const surnameInput = document.getElementById('surname');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const roleInput = document.getElementById('role');
const errorBox = document.getElementById('registerError');
const successBox = document.getElementById('registerSuccess');
const togglePwd = document.getElementById('togglePwd');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

async function registerOperator({ name, surname, email, password, role }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'operatorRequests', cred.user.uid), {
    name,
    surname,
    email,
    role,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await signOut(auth);
}

togglePwd?.addEventListener('click', () => {
  const isPwd = passwordInput.type === 'password';
  passwordInput.type = isPwd ? 'text' : 'password';
  togglePwd.setAttribute('aria-label', isPwd ? 'Hide password' : 'Show password');
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  successBox.hidden = true;

  const name = nameInput.value.trim();
  const surname = surnameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleInput.value || 'operator';

  if (!name || !surname || !email || !password) {
    showError('Please fill all fields.');
    return;
  }

  try {
    await registerOperator({ name, surname, email, password, role });
    form.reset();
    roleInput.value = 'operator';
    successBox.hidden = false;
  } catch (err) {
    const fallback = 'Could not submit registration.';
    showError(err?.message || fallback);
  }
});
