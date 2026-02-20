// js/pages/pendingApplications.js
import { db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initPendingApplications(root) {
  if (root._unsubPendingApplications) {
    try { root._unsubPendingApplications(); } catch (_) {}
    root._unsubPendingApplications = null;
  }

  root.innerHTML = `
    <div class="pending-apps-root">
      <div class="pending-toolbar">
        <div class="search-row">
          <input id="pendingSearch" placeholder="Search by name, email or id..." />
        </div>
        <div class="pending-meta" id="pendingCount">Showing 0 requests</div>
      </div>

      <div class="table-wrap">
        <table class="carrier-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Email</th>
              <th>Status</th>
              <th>Requested</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="pendingTbody"></tbody>
        </table>
      </div>

      <div id="pendingMsg" style="margin-top:10px;font-size:13px;"></div>
    </div>
  `;

  const searchEl = root.querySelector("#pendingSearch");
  const tbody = root.querySelector("#pendingTbody");
  const pendingMsg = root.querySelector("#pendingMsg");
  const pendingCount = root.querySelector("#pendingCount");

  let requests = []; // {id, name, surname, email, status, createdAt}

  const setPendingMsg = (t = "", type = "info") => {
    pendingMsg.textContent = t;
    pendingMsg.style.color = type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#344054";
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function pickField(data, keys, fallback = "") {
    for (const k of keys) {
      if (data && data[k] != null && String(data[k]).trim() !== "") return data[k];
    }
    return fallback;
  }

  function normalizeRequest(docId, data) {
    const name = pickField(data, ["name", "Name"], "—");
    const surname = pickField(data, ["surname", "Surname"], "");
    const email = pickField(data, ["email", "Email", "E-mail"], "—");
    const status = pickField(data, ["status", "Status"], "pending");
    const createdAt = data?.createdAt ?? data?.CreatedAt ?? null;
    return { id: docId, name, surname, email, status, createdAt, raw: data || {} };
  }

  function getTimestampMs(val) {
    if (!val) return 0;
    if (typeof val.toDate === "function") return val.toDate().getTime();
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function formatDate(val) {
    if (!val) return "-";
    const d = typeof val.toDate === "function" ? val.toDate() : new Date(val);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  }

  function badgeClass(status) {
    if (status === "approved") return "badge-approved";
    if (status === "rejected") return "badge-rejected";
    return "badge-pending";
  }

  function render() {
    const q = (searchEl.value || "").trim().toLowerCase();
    tbody.innerHTML = "";

    const filtered = requests
      .filter(r => (r.status || "").toLowerCase() === "pending")
      .filter(r => {
        if (!q) return true;
        return (
          String(`${r.name} ${r.surname}` || "").toLowerCase().includes(q) ||
          String(r.email || "").toLowerCase().includes(q) ||
          String(r.id || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));

    pendingCount.textContent = `Showing ${filtered.length} requests`;

    filtered.forEach(r => {
      const fullName = `${r.name || ""} ${r.surname || ""}`.trim() || "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(fullName)}<div style="font-size:12px;color:#6b7280">${escapeHtml(r.id)}</div></td>
        <td>${escapeHtml(r.email)}</td>
        <td><span class="badge ${badgeClass(r.status)}">${escapeHtml(r.status)}</span></td>
        <td>${escapeHtml(formatDate(r.createdAt))}</td>
        <td>
          <button class="btn btn-sm btn-primary" data-action="approve" data-id="${escapeHtml(r.id)}">Approve</button>
          <button class="btn btn-sm" data-action="decline" data-id="${escapeHtml(r.id)}">Decline</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (filtered.length === 0) setPendingMsg("No pending applications found.", "info");
    else setPendingMsg("", "info");
  }

  async function approveRequest(docId) {
    const req = requests.find(x => x.id === docId);
    if (!req) return;

    const fullName = `${req.name || ""} ${req.surname || ""}`.trim() || "—";

    try {
      setPendingMsg("Approving...", "info");

      const operatorRef = doc(db, "Operator", docId);
      await setDoc(
        operatorRef,
        {
          Name: req.name || "",
          Surname: req.surname || "",
          Email: req.email || "",
          Role: "operator",
          Status: "Active",
          RequestedAt: req.createdAt || null,
          ApprovedAt: serverTimestamp()
        },
        { merge: true }
      );

      await updateDoc(doc(db, "operatorRequests", docId), {
        status: "approved",
        updatedAt: serverTimestamp()
      });

      setPendingMsg(`${fullName} approved and added to Operator ✅`, "success");
    } catch (err) {
      console.error("approveRequest failed:", err);
      setPendingMsg(err?.message || "Failed to approve request.", "error");
    }
  }

  async function declineRequest(docId) {
    const req = requests.find(x => x.id === docId);
    if (!req) return;

    const fullName = `${req.name || ""} ${req.surname || ""}`.trim() || "—";

    try {
      setPendingMsg("Declining...", "info");

      await updateDoc(doc(db, "operatorRequests", docId), {
        status: "rejected",
        updatedAt: serverTimestamp()
      });

      setPendingMsg(`${fullName} declined.`, "success");
    } catch (err) {
      console.error("declineRequest failed:", err);
      setPendingMsg(err?.message || "Failed to decline request.", "error");
    }
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "approve") {
      approveRequest(btn.dataset.id);
    }
    if (btn.dataset.action === "decline") {
      declineRequest(btn.dataset.id);
    }
  });

  searchEl.addEventListener("input", render);

  const unsub = onSnapshot(
    collection(db, "operatorRequests"),
    (snap) => {
      requests = snap.docs.map(d => normalizeRequest(d.id, d.data()));
      render();
    },
    (err) => {
      console.error("operatorRequests snapshot error:", err);
      setPendingMsg(err?.message || "Failed to load requests.", "error");
    }
  );

  root._unsubPendingApplications = () => {
    try { unsub(); } catch (_) {}
  };
}
