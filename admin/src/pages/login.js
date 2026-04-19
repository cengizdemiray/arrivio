// js/pages/login.js
import { auth, db } from "../app/config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { validateAdminLogin, isAdminAuthorized } from "../services/adminServices.js";
const form = document.getElementById("loginForm");
const email = document.getElementById("email");
const password = document.getElementById("password");
const togglePwd = document.getElementById("togglePwd");

const errorBox = document.getElementById("errorBox");
const emailHint = document.getElementById("emailHint");
const pwdHint = document.getElementById("pwdHint");

togglePwd.addEventListener("click", () => {
  const isPwd = password.type === "password";
  password.type = isPwd ? "text" : "password";
  togglePwd.setAttribute("aria-label", isPwd ? "Hide password" : "Show password");
});

function setHint(el, hintEl, show) {
  el.style.borderColor = show ? "rgba(245, 181, 181, 1)" : "";
  hintEl.hidden = !show;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const result = validateAdminLogin(email.value, password.value);
  setHint(email, emailHint, !email.value.trim());
  setHint(password, pwdHint, !password.value.trim());
  if (!result.valid) {
    errorBox.textContent = result.error;
    errorBox.hidden = false;
    return;
  }

  errorBox.hidden = true;

  try {
    // Auth login
    const cred = await signInWithEmailAndPassword(auth, result.email, result.password);

    // Admin yetkisi kontrolü 
    const uid = cred.user.uid;

    const adminRef = doc(db, "Admin", uid);
    const adminSnap = await getDoc(adminRef);

    if (!isAdminAuthorized(adminSnap.exists())) {
      errorBox.textContent = "You are not authorized as admin.";
      errorBox.hidden = false;
      return;
    }

    // admin sayfasına yönlendir
    localStorage.setItem("admin_session", "true");
    window.location.href = "./dashboard.html";
  } catch (err) {
    errorBox.textContent = err?.message || "Login failed.";
    errorBox.hidden = false;
  }
});
