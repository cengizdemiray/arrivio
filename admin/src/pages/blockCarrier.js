import { auth, db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  query,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initBlockCarrier(root) {
  root.innerHTML = `
    <div class="carrier-layout">
      <div class="carrier-list">
        <div class="list-header">
          <input id="carrierSearch" placeholder="Search by carrier name, plate, or ID..." />
        </div>

        <div class="table-wrap">
          <table class="carrier-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th>Plate</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Until</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="carrierTbody"></tbody>
          </table>
        </div>

        <div id="listMsg" style="margin-top:10px;font-size:13px;"></div>
      </div>

      <aside class="control-panel">
        <div class="panel-inner">
          <h3>Block Carrier</h3>

          <div class="form-row">
            <label>Selected Carrier</label>
            <div id="selectedCarrierName">—</div>
          </div>

          <div class="form-row">
            <label>Reason</label>
            <select id="blockReason">
              <option>Safety Violation</option>
              <option>Documentation Missing</option>
              <option>Other</option>
            </select>
          </div>

          <div class="form-row">
            <label>Optional Message to Carrier</label>
            <textarea id="blockMessage" placeholder="Explain the reason..."></textarea>
          </div>

          <div class="form-row">
            <label>Duration</label>
            <select id="blockDuration">
              <option value="1">1 Day</option>
              <option value="7" selected>7 Days</option>
              <option value="30">30 Days</option>
              <option value="0">Indefinite</option>
            </select>
          </div>

          <div style="margin-top:12px;display:flex;gap:8px;">
            <button id="panelBlock" class="btn btn-primary">Block Carrier</button>
            <button id="panelUnblock" class="btn">Unblock</button>
          </div>

          <div id="panelMsg" style="margin-top:10px;font-size:13px;"></div>
        </div>
      </aside>
    </div>
  `;

  const tbody = root.querySelector("#carrierTbody");
  const search = root.querySelector("#carrierSearch");
  const selectedName = root.querySelector("#selectedCarrierName");
  const reasonEl = root.querySelector("#blockReason");
  const messageEl = root.querySelector("#blockMessage");
  const durationEl = root.querySelector("#blockDuration");
  const panelBlock = root.querySelector("#panelBlock");
  const panelUnblock = root.querySelector("#panelUnblock");
  const listMsg = root.querySelector("#listMsg");
  const panelMsg = root.querySelector("#panelMsg");

  const setListMsg = (t = "", type = "info") => {
    listMsg.textContent = t;
    listMsg.style.color = type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#344054";
  };
  const setPanelMsg = (t = "", type = "info") => {
    panelMsg.textContent = t;
    panelMsg.style.color = type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#344054";
  };

  let carriers = [];           // { id, name, plate, carrierId, status, reason, until }
  let selectedDocId = null;

  function formatDateISO(d) {
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    return `${Y}-${M}-${D}`;
  }

  function computeUntilISO(durationDays) {
    const dur = parseInt(durationDays, 10);
    if (!dur || dur <= 0) return ""; // Indefinite
    const d = new Date();
    d.setDate(d.getDate() + dur);
    return formatDateISO(d);
  }

  function normalizeCarrier(docId, data) {
    const name = String(data?.Name ?? data?.name ?? "—");
    const plate = String(data?.Vehicle_Plate ?? data?.plate ?? "—");  
    const carrierId = String(data?.Carrier_ID ?? data?.id ?? docId);

    // Block alanları
    const status = String(data?.Status ?? "Active");   // "Active" / "Blocked"
    const reason = String(data?.BlockReason ?? data?.reason ?? "");
    const until = String(data?.BlockUntil ?? data?.until ?? "");

    return { id: docId, name, plate, carrierId, status, reason, until };
  }

  function render() {
    const q = (search.value || "").trim().toLowerCase();
    tbody.innerHTML = "";

    const filtered = carriers.filter(c => {
      if (!q) return true;
      return (
        String(c.name ?? "").toLowerCase().includes(q) ||
        String(c.plate ?? "").toLowerCase().includes(q) ||       
        String(c.carrierId ?? "").toLowerCase().includes(q)
      );
    });

    filtered.forEach(c => {
      const tr = document.createElement("tr");
      const badgeClass = c.status === "Blocked" ? "badge-blocked" : "badge-active";
      tr.innerHTML = `
        <td>${escapeHtml(c.name)} <div style="font-size:12px;color:#6b7280">${escapeHtml(c.carrierId)}</div></td>
        <td>${escapeHtml(c.plate)}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(c.status)}</span></td>
        <td>${escapeHtml(c.reason || "-")}</td>
        <td>${escapeHtml(c.until || "-")}</td>
        <td><button data-id="${c.id}" class="btn btn-sm btn-select">Select</button></td>
      `;
      tbody.appendChild(tr);
    });

    root.querySelectorAll(".btn-select").forEach(b =>
      b.addEventListener("click", e => selectCarrier(e.target.dataset.id))
    );

    if (filtered.length === 0) setListMsg("No carriers found.", "info");
    else setListMsg("", "info");
  }

  function selectCarrier(docId) {
    selectedDocId = docId;
    const c = carriers.find(x => x.id === docId);
    if (!c) return;

    selectedName.textContent = `${c.name} (${c.plate})`;
    reasonEl.value = c.reason || "Safety Violation";
    messageEl.value = "";
    durationEl.value = "7";
    setPanelMsg("", "info");
  }

  async function blockSelected() {
    setPanelMsg("", "info");

    if (!selectedDocId) return setPanelMsg("Select a carrier from the list first.", "error");
    const user = auth.currentUser;
    if (!user) return setPanelMsg("Not logged in. Please login again.", "error");

    const reason = reasonEl.value;
    const message = (messageEl.value || "").trim();
    const until = computeUntilISO(durationEl.value);

    try {
      setPanelMsg("Blocking...", "info");
      const ref = doc(db, "Carrier", selectedDocId);

      await updateDoc(ref, {
        Status: "Blocked",
        BlockReason: reason,
        BlockMessage: message,
        BlockUntil: until,
        UpdatedAt: serverTimestamp(),
        UpdatedByUid: user.uid
      });

      setPanelMsg("Carrier blocked ✅", "success");
    } catch (err) {
      console.error("blockSelected failed:", err);
      setPanelMsg(err?.message || "Failed to block.", "error");
    }
  }

  async function unblockSelected() {
    setPanelMsg("", "info");

    if (!selectedDocId) return setPanelMsg("Select a carrier first.", "error");
    const user = auth.currentUser;
    if (!user) return setPanelMsg("Not logged in. Please login again.", "error");

    try {
      setPanelMsg("Unblocking...", "info");
      const ref = doc(db, "Carrier", selectedDocId);

      await updateDoc(ref, {
        Status: "Active",
        BlockReason: "",
        BlockMessage: "",
        BlockUntil: "",
        UpdatedAt: serverTimestamp(),
        UpdatedByUid: user.uid
      });

      setPanelMsg("Carrier unblocked ✅", "success");
    } catch (err) {
      console.error("unblockSelected failed:", err);
      setPanelMsg(err?.message || "Failed to unblock.", "error");
    }
  }

  panelBlock.addEventListener("click", blockSelected);
  panelUnblock.addEventListener("click", unblockSelected);
  search.addEventListener("input", render);

  const qRef = query(collection(db, "Carrier"));
  const unsub = onSnapshot(
    qRef,
    snap => {
      carriers = snap.docs.map(d => normalizeCarrier(d.id, d.data()));
      render();

      if (selectedDocId) {
        const c = carriers.find(x => x.id === selectedDocId);
        if (c) selectedName.textContent = `${c.name} (${c.plate})`;
      }
    },
    err => {
      console.error("Carrier onSnapshot error:", err);
      setListMsg(err?.message || "Failed to load carriers.", "error");
    }
  );

  root._unsubCarrier = unsub;

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
