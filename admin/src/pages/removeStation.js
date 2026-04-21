// js/pages/removeStation.js
import { auth, db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  filterStations,
  validateStationRemoval
} from "../services/adminServices.js";

export function initRemoveStation(root) {
  root.innerHTML = `
    <div class="remove-layout">
      <div class="remove-list">
        <div class="list-header">
          <input id="stationSearch" placeholder="Search stations by status/name..." />
        </div>
        <div class="table-wrap">
          <table class="station-table">
            <thead>
              <tr>
                <th><input id="selectAll" type="checkbox"/></th>
                <th>Station Name</th>
                <th>Status</th>
                <th>Longitude</th>
                <th>Latitude</th>
              </tr>
            </thead>
            <tbody id="stationTbody"></tbody>
          </table>
        </div>
      </div>

      <aside class="summary-panel">
        <div class="panel-inner">
          <h3>Removal Summary</h3>
          <div class="summary-row"><strong>Stations Selected</strong><div id="summaryCount">0</div></div>
          <div class="summary-selected" id="summarySelectedList"></div>
          <div style="margin-top:12px;">
            <button id="removeBtn" class="btn btn-danger">Remove Selected Stations</button>
          </div>
          <div id="msg" style="margin-top:10px;font-size:14px;"></div>
        </div>
      </aside>
    </div>
  `;

  const tbody = root.querySelector("#stationTbody");
  const search = root.querySelector("#stationSearch");
  const selectAll = root.querySelector("#selectAll");
  const summaryCount = root.querySelector("#summaryCount");
  const summarySelectedList = root.querySelector("#summarySelectedList");
  const removeBtn = root.querySelector("#removeBtn");
  const msgEl = root.querySelector("#msg");

  const selected = new Set();
  let stationsCache = [];

  function setMsg(text, type = "info") {
    msgEl.textContent = text || "";
    msgEl.style.color =
      type === "error" ? "#b42318" :
      type === "success" ? "#027a48" : "#344054";
  }

  function render() {
    const filtered = filterStations(stationsCache, search.value);
    tbody.innerHTML = "";

    filtered.forEach(s => {
      const stationName = s.Name || s.name || s.stationId || s.StationId || "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input data-id="${s.id}" class="row-select" type="checkbox" ${selected.has(s.id) ? "checked" : ""} /></td>
        <td>${stationName}</td>
        <td>${s.status || "-"}</td>
        <td>${s.longitude ?? s.longtitude ?? "-"}</td>
        <td>${s.latitude ?? "-"}</td>
      `;
      tbody.appendChild(tr);
    });

    root.querySelectorAll(".row-select").forEach(cb =>
      cb.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) selected.add(id);
        else selected.delete(id);
        updateSummary();
      })
    );

    updateSummary();
  }

  function updateSummary() {
    const ids = Array.from(selected);
    summaryCount.textContent = ids.length;
    summarySelectedList.innerHTML = ids
      .map(id => {
        const s = stationsCache.find(st => st.id === id);
        const label = s?.Name || s?.name || s?.stationId || s?.StationId || id;
        return `<div class="summary-item">${label}</div>`;
      })
      .join("");
  }

  selectAll.addEventListener("change", (e) => {
    if (e.target.checked) {
      stationsCache.forEach(s => selected.add(s.id));
    } else {
      selected.clear();
    }
    render();
  });

  search.addEventListener("input", render);

  removeBtn.addEventListener("click", async () => {
    const result = validateStationRemoval(Array.from(selected));
    if (!result.valid) {
      alert(result.error);
      return;
    }

    if (!auth.currentUser) {
      setMsg("Not logged in. Please login again.", "error");
      return;
    }

    const ok = confirm(`${result.ids.length} station will be deleted from Firestore. Continue?`);
    if (!ok) return;

    try {
      setMsg("Deleting...", "info");
      for (const id of result.ids) {
        await deleteDoc(doc(db, "Station", id));
        selected.delete(id);
      }
      setMsg("Deleted ✅", "success");
    } catch (err) {
      console.error("Delete failed:", err);
      setMsg(err?.message || "Delete failed.", "error");
    }
  });

  // Realtime listen
  const qStations = query(collection(db, "Station"));
  const unsub = onSnapshot(
    qStations,
    (snap) => {
      stationsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error("Station listen error:", err);
      setMsg(err?.message || "Failed to load stations.", "error");
    }
  );
}
