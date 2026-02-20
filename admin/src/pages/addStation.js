// js/pages/addStation.js
import { auth, db } from "../app/config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initAddStation(root) {
  root.innerHTML = `
    <div class="wizard">
      <div class="wizard-steps">
        <div class="step is-active" data-step="1"><div class="circle">1</div><div>Basics</div></div>
        <div class="step" data-step="2"><div class="circle">2</div><div>Manager Information</div></div>
      </div>

      <div class="wizard-body">
        <div class="wizard-summary">
          <strong>Basics</strong>
          <div id="summaryBasics">No data yet</div>
        </div>

        <div class="wizard-content" id="wizardContent">
          <form id="basicsForm" class="station-form">
            <h3>Add New Station</h3>

            <div class="station-form-grid">
              <div class="form-row">
                <label>Longitude</label>
                <input id="longitude" required />
              </div>

              <div class="form-row">
                <label>Latitude</label>
                <input id="latitude" required />
              </div>

              <div class="form-row">
                <label>Status</label>
                <select id="status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>

              <div class="form-row">
                <label>Type</label>
                <select id="type">
                  <option value="Load">Load</option>
                  <option value="Unload">Unload</option>
                </select>
              </div>

              <div class="form-row">
                <label>Station ID</label>
                <input id="stationId" class="station-id-input" required placeholder="Station ID" />
              </div>
            </div>

            <div class="form-actions">
              <button type="button" id="basicsContinue" class="btn btn-primary">Continue</button>
            </div>
            <div id="msg"></div>
          </form>
        </div>
      </div>
    </div>
  `;

  const summary = root.querySelector("#summaryBasics");
  const wizardContent = root.querySelector("#wizardContent");
  const msg = root.querySelector("#msg");
  let basics = null;
  const step1 = root.querySelector('.step[data-step="1"]');
  const step2 = root.querySelector('.step[data-step="2"]');

  const parse = v => parseFloat(String(v).replace(",", "."));

  root.querySelector("#basicsContinue").onclick = () => {
    const lon = parse(root.querySelector("#longitude").value);
    const lat = parse(root.querySelector("#latitude").value);
    const stationId = root.querySelector("#stationId").value.trim();

    if (Number.isNaN(lon) || Number.isNaN(lat)) {
      msg.textContent = "Invalid coordinates";
      msg.style.color = "red";
      return;
    }
    if (!stationId) {
      msg.textContent = "Station ID is required";
      msg.style.color = "red";
      return;
    }

    basics = {
      longitude: lon,
      latitude: lat,
      status: root.querySelector("#status").value,
      type: root.querySelector("#type").value,
      stationId
    };

    summary.innerHTML = `
      <div class="summary-list">
        <div class="summary-item"><span>Station ID</span><span>${escapeHtml(basics.stationId || "-")}</span></div>
        <div class="summary-item"><span>Longitude</span><span>${escapeHtml(basics.longitude)}</span></div>
        <div class="summary-item"><span>Latitude</span><span>${escapeHtml(basics.latitude)}</span></div>
        <div class="summary-item"><span>Status</span><span>${escapeHtml(basics.status)}</span></div>
        <div class="summary-item"><span>Type</span><span>${escapeHtml(basics.type || "-")}</span></div>
      </div>
    `;
    renderStep2();
  };

  function renderStep2() {
    if (step1) step1.classList.remove("is-active");
    if (step2) step2.classList.add("is-active");

    wizardContent.innerHTML = `
      <h3>Manager Information</h3>
      <div class="form-row">
        <label>Manager name</label>
        <input id="contactName" placeholder="Manager name"/>
      </div>
      <div class="form-row">
        <label>Phone</label>
        <input id="phone" placeholder="Phone"/>
      </div>
      <button id="saveStation">Add Station</button>
      <div id="msg2"></div>
    `;

    const msg2 = wizardContent.querySelector("#msg2");

    wizardContent.querySelector("#saveStation").onclick = async () => {
      if (!auth.currentUser) {
        msg2.textContent = "Not logged in";
        msg2.style.color = "red";
        return;
      }

      try {
      const station = {
        ...basics,
        StationId: basics.stationId,
        contactName: wizardContent.querySelector("#contactName").value,
        phone: wizardContent.querySelector("#phone").value,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        };

        await addDoc(collection(db, "Station"), station);

        msg2.textContent = "Station saved ✅";
        msg2.style.color = "green";

        setTimeout(() => initAddStation(root), 800);
      } catch (e) {
        msg2.textContent = e.message;
        msg2.style.color = "red";
      }
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
