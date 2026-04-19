import { auth, db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  query,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  normalizeCarrier,
  computeBlockUntilDate,
  buildBlockPayload,
  buildUnblockPayload,
  filterCarriers,
  isBlockExpired,
  getExpiredCarriers
} from "../services/adminServices.js";

export function initBlockCarrier(root) {
  if (root._unsubCarrier) {
    try { root._unsubCarrier(); } catch (_) {}
    root._unsubCarrier = null;
  }

  root.innerHTML = `
    <div class="bc-root">
      <div class="bc-toolbar">
        <div class="bc-toolbar-left">
          <input id="carrierSearch" class="bc-search" placeholder="Search by name, plate or ID..." />
        </div>
        <div class="bc-toolbar-right">
          <span class="bc-count" id="carrierCount">0 carriers</span>
        </div>
      </div>

      <div id="carrierGrid" class="bc-grid"></div>

      <div id="bcMsg" style="margin-top:10px;font-size:13px;"></div>
    </div>

    <!-- Block Modal -->
    <div id="blockModal" class="bc-modal-overlay" style="display:none;">
      <div class="bc-modal">
        <div class="bc-modal-header">
          <h3 id="modalTitle">Block Carrier</h3>
          <button id="modalClose" class="bc-modal-close">&times;</button>
        </div>
        <div class="bc-modal-body">
          <div class="form-row">
            <label>Reason</label>
            <select id="blockReason">
              <option>Safety Violation</option>
              <option>Documentation Missing</option>
              <option>Other</option>
            </select>
          </div>
          <div class="form-row">
            <label>Message to Carrier (optional)</label>
            <textarea id="blockMessage" placeholder="Explain the reason..." rows="3"></textarea>
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
        </div>
        <div class="bc-modal-footer">
          <button id="modalCancel" class="btn">Cancel</button>
          <button id="modalConfirm" class="btn btn-primary">Block</button>
        </div>
        <div id="modalMsg" style="margin-top:8px;font-size:13px;"></div>
      </div>
    </div>
  `;

  const grid = root.querySelector("#carrierGrid");
  const search = root.querySelector("#carrierSearch");
  const countEl = root.querySelector("#carrierCount");
  const bcMsg = root.querySelector("#bcMsg");

  // modal elements
  const modal = root.querySelector("#blockModal");
  const modalTitle = root.querySelector("#modalTitle");
  const modalClose = root.querySelector("#modalClose");
  const modalCancel = root.querySelector("#modalCancel");
  const modalConfirm = root.querySelector("#modalConfirm");
  const modalMsg = root.querySelector("#modalMsg");
  const reasonEl = root.querySelector("#blockReason");
  const messageEl = root.querySelector("#blockMessage");
  const durationEl = root.querySelector("#blockDuration");

  let carriers = [];
  let selectedDocId = null;
  let autoUnblockDone = false;

  const setBcMsg = (t = "", type = "info") => {
    bcMsg.textContent = t;
    bcMsg.style.color = type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#344054";
  };

  const setModalMsg = (t = "", type = "info") => {
    modalMsg.textContent = t;
    modalMsg.style.color = type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#344054";
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ── Modal helpers ──
  function openBlockModal(docId) {
    selectedDocId = docId;
    const c = carriers.find(x => x.id === docId);
    if (!c) return;
    modalTitle.textContent = `Block: ${c.name}`;
    reasonEl.value = "Safety Violation";
    messageEl.value = "";
    durationEl.value = "7";
    setModalMsg("");
    modal.style.display = "flex";
  }

  function closeModal() {
    modal.style.display = "none";
    selectedDocId = null;
    setModalMsg("");
  }

  modalClose.addEventListener("click", closeModal);
  modalCancel.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // ── Block / Unblock actions ──
  modalConfirm.addEventListener("click", async () => {
    if (!selectedDocId) return;
    const user = auth.currentUser;
    if (!user) return setModalMsg("Not logged in.", "error");

    const reason = reasonEl.value;
    const message = (messageEl.value || "").trim();
    const until = computeBlockUntilDate(durationEl.value);

    try {
      setModalMsg("Blocking...", "info");
      modalConfirm.disabled = true;
      await updateDoc(doc(db, "Carrier", selectedDocId), {
        ...buildBlockPayload(reason, message, until, user.uid),
        UpdatedAt: serverTimestamp()
      });
      closeModal();
    } catch (err) {
      console.error("block failed:", err);
      setModalMsg(err?.message || "Failed to block.", "error");
    } finally {
      modalConfirm.disabled = false;
    }
  });

  async function unblockCarrier(docId) {
    const user = auth.currentUser;
    if (!user) return setBcMsg("Not logged in.", "error");

    try {
      await updateDoc(doc(db, "Carrier", docId), {
        ...buildUnblockPayload(user.uid),
        UpdatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("unblock failed:", err);
      setBcMsg(err?.message || "Failed to unblock.", "error");
    }
  }

  // ── Auto-unblock expired carriers on page load ──
  async function autoUnblockExpired() {
    if (autoUnblockDone) return;
    autoUnblockDone = true;

    const expired = getExpiredCarriers(carriers);
    if (!expired.length) return;

    const user = auth.currentUser;
    if (!user) return;

    let count = 0;
    for (const c of expired) {
      try {
        await updateDoc(doc(db, "Carrier", c.id), {
          ...buildUnblockPayload(user.uid),
          UpdatedAt: serverTimestamp()
        });
        count++;
      } catch (err) {
        console.error(`Auto-unblock failed for ${c.id}:`, err);
      }
    }

    if (count > 0) {
      setBcMsg(`${count} carrier(s) auto-unblocked (block period expired).`, "success");
    }
  }

  // ── Render cards ──
  function render() {
    grid.innerHTML = "";
    const filtered = filterCarriers(carriers, search.value);
    countEl.textContent = `${filtered.length} carrier${filtered.length !== 1 ? "s" : ""}`;

    filtered.forEach(c => {
      const isBlocked = c.status === "Blocked";
      const expired = isBlockExpired(c);
      const card = document.createElement("div");
      card.className = `bc-card ${isBlocked ? "bc-card--blocked" : "bc-card--active"}`;

      card.innerHTML = `
        <div class="bc-card-head">
          <div>
            <div class="bc-card-name">${escapeHtml(c.name)}</div>
            <div class="bc-card-id">${escapeHtml(c.carrierId)}</div>
          </div>
          <span class="badge ${isBlocked ? "badge-blocked" : "badge-active"}">${escapeHtml(c.status)}</span>
        </div>

        <div class="bc-card-details">
          <div class="bc-card-row">
            <span class="bc-card-label">Plate</span>
            <span>${escapeHtml(c.plate)}</span>
          </div>
          ${isBlocked ? `
            <div class="bc-card-row">
              <span class="bc-card-label">Reason</span>
              <span>${escapeHtml(c.reason || "-")}</span>
            </div>
            <div class="bc-card-row">
              <span class="bc-card-label">Until</span>
              <span>${escapeHtml(c.until || "Indefinite")}${expired ? ' <span class="bc-expired-tag">EXPIRED</span>' : ""}</span>
            </div>
          ` : ""}
        </div>

        <div class="bc-card-actions">
          ${isBlocked
            ? `<button class="btn btn-sm bc-btn-unblock" data-id="${c.id}">Unblock</button>`
            : `<button class="btn btn-sm btn-primary bc-btn-block" data-id="${c.id}">Block</button>`
          }
        </div>
      `;

      grid.appendChild(card);
    });

    // event delegation
    grid.querySelectorAll(".bc-btn-block").forEach(b =>
      b.addEventListener("click", () => openBlockModal(b.dataset.id))
    );
    grid.querySelectorAll(".bc-btn-unblock").forEach(b =>
      b.addEventListener("click", () => unblockCarrier(b.dataset.id))
    );

    if (filtered.length === 0) setBcMsg("No carriers found.", "info");
    else setBcMsg("", "info");
  }

  search.addEventListener("input", render);

  // ── Realtime listener ──
  const qRef = query(collection(db, "Carrier"));
  const unsub = onSnapshot(
    qRef,
    snap => {
      carriers = snap.docs.map(d => normalizeCarrier(d.id, d.data()));
      render();
      autoUnblockExpired();
    },
    err => {
      console.error("Carrier onSnapshot error:", err);
      setBcMsg(err?.message || "Failed to load carriers.", "error");
    }
  );

  root._unsubCarrier = unsub;
}
