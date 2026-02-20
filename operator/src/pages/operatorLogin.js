// js/pages/operatorLogin.js
import { auth } from '../sevices/firebaseClient.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePwd = document.getElementById('togglePwd');
const errorBox = document.getElementById('loginError');
const pendingBox = document.getElementById('pendingBox');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

// Simple password show/hide toggle
togglePwd?.addEventListener('click', () => {
  const isPwd = passwordInput.type === 'password';
  passwordInput.type = isPwd ? 'text' : 'password';
  togglePwd.setAttribute('aria-label', isPwd ? 'Hide password' : 'Show password');
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  pendingBox.hidden = true;

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    showError('Please enter email and password.');
    return;
  }

  try {
    // Authenticate via Firebase only; no mock password fallback
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showError(err?.message || 'Invalid credentials.');
    return;
  }

  const user = auth.currentUser;
  const operatorId = user?.uid || email;
  const operatorEmail = user?.email || email;
  const operatorName = (user?.displayName || email.split('@')[0] || 'Operator').trim();

  localStorage.setItem('operator_session', 'true');
  localStorage.setItem('operator_user_id', operatorId);
  localStorage.setItem('operator_user_email', operatorEmail);
  localStorage.setItem('operator_user_name', operatorName);
  window.location.href = './index.html';
});
