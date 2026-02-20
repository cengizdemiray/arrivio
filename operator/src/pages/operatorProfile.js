import { auth } from '../sevices/firebaseClient.js';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

export async function renderProfileView(root, deps) {
  const {
    getCurrentOperator,
    loadQueueStations,
    getFocusedStation,
    setFocusedStation,
    formatNow
  } = deps || {};

  const operator = getCurrentOperator?.() || {};
  const stations = await loadQueueStations?.() || [];
  let focusedStation = getFocusedStation?.() || null;

  if (!focusedStation && stations.length) {
    const first = stations[0];
    focusedStation = {
      id: first.id || first.code,
      code: first.code || first.id || '',
      name: first.name || first.code || 'Station'
    };
    setFocusedStation?.(focusedStation);
  }

  root.innerHTML = `
    <div class="operator-hero">
      <div class="hero-row">
        <div>
          <div class="hero-title">Profile</div>
          <p class="hero-sub">Account details, station focus and password settings.</p>
        </div>
      </div>
    </div>

    <div class="profile-layout">
      <section class="profile-card">
        <h3>Operator Info</h3>
        <div class="profile-row">
          <div class="profile-label">Name</div>
          <div class="profile-value">${operator.name || 'Operator'}</div>
        </div>
        <div class="profile-row">
          <div class="profile-label">Email</div>
          <div class="profile-value">${operator.email || '-'}</div>
        </div>
        <div class="profile-row">
          <div class="profile-label">Operator ID</div>
          <div class="profile-value">${operator.id || '-'}</div>
        </div>
        <div class="profile-row">
          <div class="profile-label">Last update</div>
          <div class="profile-value">${formatNow?.() || ''}</div>
        </div>

        <div class="profile-station-block">
          <label for="profileStationSelect">Focused Station</label>
          <select id="profileStationSelect">
            ${stations.map(st => {
              const key = st.id || st.code;
              const code = st.code || st.id || '';
              const selected = focusedStation && (focusedStation.id === key || focusedStation.code === code) ? 'selected' : '';
              return `<option value="${key}" ${selected}>${st.name || code} (${code})</option>`;
            }).join('')}
          </select>
          <p class="profile-note">This station is shown as your active focus.</p>
        </div>
      </section>

      <section class="profile-card">
        <h3>Change Password</h3>
        <p class="profile-note">For security, enter your current password before setting a new one.</p>
        <form id="changePasswordForm" class="profile-form" novalidate>
          <div class="form-col full">
            <label for="currentPassword">Current Password</label>
            <input id="currentPassword" type="password" autocomplete="current-password" required />
          </div>
          <div class="form-col full">
            <label for="newPassword">New Password</label>
            <input id="newPassword" type="password" autocomplete="new-password" minlength="6" required />
          </div>
          <div class="form-col full">
            <label for="confirmPassword">Confirm New Password</label>
            <input id="confirmPassword" type="password" autocomplete="new-password" minlength="6" required />
          </div>
          <div id="passwordError" class="alert alert-error" hidden></div>
          <div id="passwordSuccess" class="alert" role="status" hidden style="background:#ecfdf3;border:1px solid #bbf7d0;color:#166534;">
            Password updated successfully.
          </div>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </form>
      </section>
    </div>
  `;

  const stationSelect = root.querySelector('#profileStationSelect');
  const form = root.querySelector('#changePasswordForm');
  const currentPasswordInput = root.querySelector('#currentPassword');
  const newPasswordInput = root.querySelector('#newPassword');
  const confirmPasswordInput = root.querySelector('#confirmPassword');
  const errorBox = root.querySelector('#passwordError');
  const successBox = root.querySelector('#passwordSuccess');

  stationSelect?.addEventListener('change', () => {
    const station = stations.find(st => (st.id || st.code) === stationSelect.value);
    if (!station) return;
    setFocusedStation?.({
      id: station.id || station.code,
      code: station.code || station.id || '',
      name: station.name || station.code || 'Station'
    });
  });

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    successBox.hidden = true;

    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showError('Please fill all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      showError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('New password and confirmation do not match.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      showError('Session not ready. Please re-login and try again.');
      return;
    }

    try {
      const email = currentUser.email || operator.email || '';
      if (!email) {
        throw new Error('Account email not found.');
      }
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      form.reset();
      successBox.hidden = false;
    } catch (err) {
      showError(err?.message || 'Password update failed.');
    }
  });
}
