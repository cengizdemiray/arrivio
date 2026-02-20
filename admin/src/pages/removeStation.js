// js/pages/removeStation.js (Firestore version)
import { auth, db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initRemoveStation(root) {
  root.innerHTML = `
    <div class="remove-layout">
      <div class="remove-list">
        <div class="list-header">
          <input id="stationSearch" placeholder="Search stations by type/status..." />
        </div>
        <div class="table-wrap">
          <table class="station-table">
            <thead>
              <tr>
                <th><input id="selectAll" type="checkbox"/></th>
                <th>Doc ID</th>
                <th>Station ID</th>
                <th>Type</th>
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

  const selected = new Set(); // selected docIds
  let stationsCache = [];     // [{id, ...data}]

  function setMsg(text, type = "info") {
    msgEl.textContent = text || "";
    msgEl.style.color =
      type === "error" ? "#b42318" :
      type === "success" ? "#027a48" : "#344054";
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    tbody.innerHTML = "";

      const filtered = stationsCache.filter(s => {
        if (!q) return true;
        const type = String(s.type || "").toLowerCase();
        const status = String(s.status || "").toLowerCase();
        const stationId = String(s.stationId || s.StationId || "").toLowerCase();
        return type.includes(q) || status.includes(q) || s.id.toLowerCase().includes(q) || stationId.includes(q);
      });

    filtered.forEach(s => {
      const stationId = s.stationId || s.StationId || "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input data-id="${s.id}" class="row-select" type="checkbox" ${selected.has(s.id) ? "checked" : ""} /></td>
        <td style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${s.id}</td>
        <td>${stationId}</td>
        <td>${s.type || "-"}</td>
        <td>${s.status || "-"}</td>
        <td>${s.longitude ?? "-"}</td>
        <td>${s.latitude ?? "-"}</td>
      `;
      tbody.appendChild(tr);
    });

    // hook row checkboxes
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
      .map(id => `<div class="summary-item">${id}</div>`)
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
    const ids = Array.from(selected);
    if (ids.length === 0) {
      alert("Select at least one station to remove.");
      return;
    }

    // auth guard (opsiyonel)
    if (!auth.currentUser) {
      setMsg("Not logged in. Please login again.", "error");
      return;
    }

    const ok = confirm(`${ids.length} station will be deleted from Firestore. Continue?`);
    if (!ok) return;

    try {
      setMsg("Deleting...", "info");
      for (const id of ids) {
        await deleteDoc(doc(db, "Station", id));
        selected.delete(id);
      }
      setMsg("Deleted ✅", "success");
    } catch (err) {
      console.error("Delete failed:", err);
      setMsg(err?.message || "Delete failed.", "error");
    }
  });

  // 🔥 Realtime listen
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
