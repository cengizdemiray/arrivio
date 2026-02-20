// js/pages/manageUsers.js  (Firestore version)
// Admin + Carrier + Operator collections are used as "roles".
// Role change = move doc between collections using same UID docId.

import { auth, db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initManageUsers(root) {
  // cleanup previous listeners if user navigates away and returns
  if (root._unsubManageUsers) {
    try { root._unsubManageUsers(); } catch (_) {}
    root._unsubManageUsers = null;
  }

  root.innerHTML = `
    <div class="manage-users-root">
      <div class="manage-header">
        <h2>Manage Users</h2>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="search-row">
            <input id="userSearch" placeholder="Search users by name, email or id..." />
          </div>
          <div>
            <select id="roleFilter" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:#fff;">
              <option value="all">All Roles</option>
              <option value="carrier">carrier</option>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
      </div>

      <div class="manage-grid">
        <section class="manage-list">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="color:#6b7280;font-size:13px;" id="resultsCount">Showing 0 results</div>
            <button id="loadMore" class="btn" style="display:none;">Load More</button>
          </div>
          <div id="userResults" class="user-results"></div>
        </section>

        <aside class="manage-details">
          <h3>User Details</h3>
          <div id="detailsBox" class="details-box">
            <div><strong id="uName">No user selected</strong></div>
            <div id="uEmail" style="color:#6b7280;margin-top:6px"></div>

            <div style="margin-top:12px">
              <label>Role</label>
              <select id="uRole" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:#fff;">
                <option value="carrier">carrier</option>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div style="margin-top:12px">
              <button id="saveRole" class="btn btn-primary">Save Role</button>
            </div>

            <div id="detailMsg" style="margin-top:10px;font-size:13px;"></div>
          </div>
        </aside>
      </div>
    </div>
  `;

  const searchEl = root.querySelector("#userSearch");
  const resultsEl = root.querySelector("#userResults");
  const resultsCount = root.querySelector("#resultsCount");
  const loadMore = root.querySelector("#loadMore");
  const roleFilter = root.querySelector("#roleFilter");

  const uName = root.querySelector("#uName");
  const uEmail = root.querySelector("#uEmail");
  const uRole = root.querySelector("#uRole");
  const saveRole = root.querySelector("#saveRole");
  const detailMsg = root.querySelector("#detailMsg");

  // pagination
  let offset = 0;
  const limit = 10;

  // state
  let selectedUid = null;
  let lastQuery = "";
  let allUsers = []; // [{uid, name, email, role, data}]

  // listener buckets
  const bucket = {
    admin: [],
    carrier: [],
    operator: []
  };

  function setDetailMsg(t = "", type = "info") {
    detailMsg.textContent = t;
    detailMsg.style.color =
      type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#344054";
  }

  function pickField(data, keys, fallback = "") {
    for (const k of keys) {
      if (data && data[k] != null && String(data[k]).trim() !== "") return data[k];
    }
    return fallback;
  }

  function normalize(role, uid, data) {
    const name = pickField(data, ["Name", "name"], "—");
    const surname = pickField(data, ["Surname", "surname"], "");
    const fullName = (String(name || "") + (surname ? ` ${surname}` : "")).trim() || "—";

    const email = pickField(data, ["E-mail", "Email", "email"], "—");
    return { uid, role, name: fullName, email: String(email || "—"), data: data || {} };
  }

  function applyFilters(queryStr, roleVal) {
    const q = (queryStr || "").trim().toLowerCase();
    const rf = roleVal || "all";

    let list = allUsers;

    if (rf !== "all") list = list.filter(u => u.role === rf);

    if (q) {
      list = list.filter(u => {
        return (
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.uid || "").toLowerCase().includes(q)
        );
      });
    }

    // stable sort
    list = list.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }

  function roleBadge(role) {
    const cls = role === "admin" ? "badge-admin" : role === "operator" ? "badge-operator" : "badge-carrier";
    return `<span class="badge ${cls}">${escapeHtml(role)}</span>`;
  }

  function render(reset = false) {
    if (reset) {
      offset = 0;
      resultsEl.innerHTML = "";
      selectedUid = null;
      showDetails(null);
    }

    const filtered = applyFilters(lastQuery, roleFilter.value);
    const page = filtered.slice(offset, offset + limit);

    resultsCount.textContent = `Showing ${Math.min(offset + page.length, filtered.length)} of ${filtered.length} results`;

    page.forEach(u => {
      const item = document.createElement("div");
      item.className = "user-item";
      item.innerHTML = `
        <div class="user-left">
          <div class="user-title">${escapeHtml(u.name)}</div>
          <div class="user-sub">${escapeHtml(u.email)} • <span style="color:#6b7280">${escapeHtml(u.uid)}</span></div>
        </div>
        <div class="user-right">
          ${roleBadge(u.role)}
          <select class="roleSelect" data-uid="${escapeHtml(u.uid)}" style="margin-left:10px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:#fff;">
            <option value="carrier" ${u.role === "carrier" ? "selected" : ""}>carrier</option>
            <option value="operator" ${u.role === "operator" ? "selected" : ""}>operator</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
          </select>
        </div>
      `;

      item.addEventListener("click", () => selectUser(u.uid));
      resultsEl.appendChild(item);
    });

    // dropdown change handlers
    resultsEl.querySelectorAll(".roleSelect").forEach(sel => {
      sel.addEventListener("change", async (e) => {
        e.stopPropagation();
        const uid = e.target.dataset.uid;
        const newRole = e.target.value;

        const current = allUsers.find(x => x.uid === uid);
        if (!current) return;

        try {
          await changeUserRole(uid, current.role, newRole);
          showToast("Role updated ✅");
        } catch (err) {
          console.error(err);
          alert(err?.message || "Failed to update role");
        }
      });
    });

    offset += page.length;

    loadMore.style.display = offset < filtered.length ? "inline-block" : "none";
  }

  function showDetails(u) {
    if (!u) {
      uName.textContent = "No user selected";
      uEmail.textContent = "";
      uRole.value = "carrier";
      setDetailMsg("");
      return;
    }
    uName.textContent = u.name || "—";
    uEmail.textContent = u.email || "—";
    uRole.value = u.role || "carrier";
    setDetailMsg("");
  }

  function selectUser(uid) {
    selectedUid = uid;
    const u = allUsers.find(x => x.uid === uid);
    showDetails(u);
  }

  function roleToCollection(role) {
    if (role === "admin") return "Admin";
    if (role === "operator") return "Operator";
    return "Carrier";
  }

  async function changeUserRole(uid, oldRole, newRole) {
    if (!uid) throw new Error("No user selected");
    if (oldRole === newRole) return;

    const currentAdmin = auth.currentUser;
    if (!currentAdmin) throw new Error("Not logged in. Please login again.");

    setDetailMsg("Updating role...", "info");

    const fromCol = roleToCollection(oldRole);
    const toCol = roleToCollection(newRole);

    const fromRef = doc(db, fromCol, uid);
    const toRef = doc(db, toCol, uid);

    const snap = await getDoc(fromRef);
    if (!snap.exists()) throw new Error(`Source document not found in ${fromCol}`);

    const data = snap.data() || {};

    // write into new role collection
    await setDoc(
      toRef,
      {
        ...data,
        Role: newRole,
        UpdatedAt: serverTimestamp(),
        UpdatedByUid: currentAdmin.uid
      },
      { merge: true }
    );

    // delete from old role collection
    await deleteDoc(fromRef);

    // update local listeners/buckets immediately so UI doesn't temporarily remove user
    try {
      // remove from old bucket
      const fromList = bucket[oldRole] || [];
      const idx = fromList.findIndex(x => x.uid === uid);
      if (idx !== -1) fromList.splice(idx, 1);

      // add to new bucket
      const newNorm = normalize(newRole, uid, { ...(data || {}), Role: newRole });
      bucket[newRole] = bucket[newRole] || [];
      bucket[newRole].push(newNorm);

      // rebuild combined list and update UI
      rebuildAllUsers();

      // if the changed user is selected, update detail panel
      if (selectedUid === uid) showDetails(newNorm);

      setDetailMsg("Role saved ✅", "success");
    } catch (uiErr) {
      console.warn('Local update after role change failed', uiErr);
    }
  }

  // Save Role button (detail panel)
  saveRole.addEventListener("click", async () => {
    try {
      if (!selectedUid) {
        setDetailMsg("Select a user first.", "error");
        return;
      }
      const current = allUsers.find(x => x.uid === selectedUid);
      if (!current) {
        setDetailMsg("Selected user not found.", "error");
        return;
      }
      await changeUserRole(selectedUid, current.role, uRole.value);
      showToast("Role updated ✅");
    } catch (err) {
      console.error(err);
      setDetailMsg(err?.message || "Failed to update role", "error");
    }
  });

  // search / filter
  searchEl.addEventListener("input", () => {
    lastQuery = searchEl.value || "";
    render(true);
  });

  roleFilter.addEventListener("change", () => {
    render(true);
  });

  loadMore.addEventListener("click", () => render(false));

  // realtime listeners (3 collections)
  const unsubs = [];

  function rebuildAllUsers() {
    allUsers = [...bucket.admin, ...bucket.carrier, ...bucket.operator];
    render(true);
  }

  unsubs.push(
    onSnapshot(collection(db, "Admin"), (snap) => {
      bucket.admin = snap.docs.map(d => normalize("admin", d.id, d.data()));
      rebuildAllUsers();
    })
  );

  unsubs.push(
    onSnapshot(collection(db, "Carrier"), (snap) => {
      bucket.carrier = snap.docs.map(d => normalize("carrier", d.id, d.data()));
      rebuildAllUsers();
    })
  );

  unsubs.push(
    onSnapshot(collection(db, "Operator"), (snap) => {
      bucket.operator = snap.docs.map(d => normalize("operator", d.id, d.data()));
      rebuildAllUsers();
    })
  );

  // store cleanup
  root._unsubManageUsers = () => {
    unsubs.forEach(fn => { try { fn(); } catch (_) {} });
  };

  // helpers
  function showToast(text, timeout = 1500) {
    const container = root.querySelector(".manage-header") || root;
    const t = document.createElement("div");
    t.textContent = text;
    t.style.background = "linear-gradient(90deg,#111827,#3b82f6)";
    t.style.color = "#fff";
    t.style.padding = "8px 12px";
    t.style.borderRadius = "8px";
    t.style.marginTop = "8px";
    t.style.boxShadow = "0 8px 30px rgba(14,24,46,0.12)";
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, timeout);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
