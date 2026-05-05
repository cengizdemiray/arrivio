// js/pages/operatorLogin.js
import { auth, db } from '../sevices/firebaseClient.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { validateLoginInput, buildOperatorSession } from '../services/operatorServices.js';

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

  const validation = validateLoginInput(emailInput.value, passwordInput.value);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  try {
    // Authenticate via Firebase only; no mock password fallback
    await signInWithEmailAndPassword(auth, validation.email, validation.password);
  } catch (err) {
    showError(err?.message || 'Invalid credentials.');
    return;
  }

  const user = auth.currentUser;
  const uid = user.uid;

  // 1) Operator koleksiyonunda var mı kontrol et
  const operatorSnap = await getDoc(doc(db, "Operator", uid));

  if (!operatorSnap.exists()) {
    // 2) operatorRequests'te başvurusu var mı kontrol et
    const reqQuery = query(
      collection(db, "operatorRequests"),
      where("email", "==", validation.email)
    );
    const reqSnap = await getDocs(reqQuery);

    if (!reqSnap.empty) {
      const reqData = reqSnap.docs[0].data();
      const status = (reqData.status || "").toLowerCase();

      if (status === "rejected") {
        showError("Your application has been rejected. You cannot access the system.");
        return;
      }
      if (status === "pending") {
        pendingBox.hidden = false;
        return;
      }
    }

    showError("You are not registered as an operator.");
    return;
  }

  const session = buildOperatorSession(user, validation.email);

  localStorage.setItem('operator_session', 'true');
  localStorage.setItem('operator_user_id', session.operatorId);
  localStorage.setItem('operator_user_email', session.operatorEmail);
  localStorage.setItem('operator_user_name', session.operatorName);
  window.location.href = './index.html';
});
