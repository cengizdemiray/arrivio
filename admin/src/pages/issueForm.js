/* ... importlar aynı kalıyor ... */
import { auth, db } from "../app/config.js";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where, // <-- Eklendi
  orderBy
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  normalizeIssue,
  searchIssues,
  buildIssueResolvePayload
} from "../services/adminServices.js";
export function initIssueForm(root, options = {}) {
  const mode = options.mode || "view"; // "view" veya "solve"
  const isMockMode = options.mock === true;

  // Modlara göre hangi statüyü bekliyoruz?
  // "view" modunda aktif sorunları (Waiting), "solve" modunda çözülenleri (Solved) gösteriyoruz.
  const targetStatus = mode === "solve" ? "Solved" : "Waiting";

  /* ── Hero (Aynı kalabilir veya targetStatus'a göre güncellenir) ── */
  const heroTitle = mode === "solve" ? "Solved Issues" : "Active Issues";
  const heroSub   = mode === "solve" ? "Browse resolved/closed issues."
                  : "View all active issues and mark them as solved.";
  const heroIcon  = mode === "solve" ? "✔" : "📋";

  root.innerHTML = `
    <div class="issue-root">
      <div class="page-hero" style="margin-bottom:14px;">
        <div class="hero-inner">
          <div class="hero-icon">${heroIcon}</div>
          <div>
            <div class="hero-title">${heroTitle}</div>
            <div class="hero-sub">${heroSub}</div>
          </div>
        </div>
      </div>
      <div class="issue-layout issue-layout--list-only">
        <div class="issue-list-section">
          <div class="issue-filter-bar">
            <input id="issueSearch" type="text" placeholder="Search issues..." class="issue-search-input" />
            <select id="issuePriorityFilter" class="issue-filter-select">
              <option value="all">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div id="issueCount" class="issue-count"></div>
          <div id="issueList" class="issue-list"></div>
        </div>
      </div>
    </div>
  `;

  const listEl       = root.querySelector("#issueList");
  const searchEl     = root.querySelector("#issueSearch");
  const priorityFilt = root.querySelector("#issuePriorityFilter");
  const countEl      = root.querySelector("#issueCount");

  let currentIssues = [];

  /* ── Filtering ── */
  function getFilteredIssues() {
    // 1. Önce searchIssues'a ana listeyi (currentIssues) gönderiyoruz (Hata burada düzeltildi)
    let list = searchIssues(currentIssues, searchEl ? searchEl.value : '');

    // 2. Öncelik filtresi
    if (priorityFilt && priorityFilt.value !== 'all') {
      list = list.filter(i => i.Priority === priorityFilt.value);
    }
    return list;
  }

  function refreshList() {
    const filtered = getFilteredIssues();
    if (countEl) countEl.textContent = `${filtered.length} issue${filtered.length !== 1 ? 's' : ''} found`;
    renderIssues(filtered);
  }

  if (searchEl)     searchEl.addEventListener("input", refreshList);
  if (priorityFilt) priorityFilt.addEventListener("change", refreshList);

  /* ── Firestore Listener (Sorgu Filtrelendi) ── */
  // Sadece targetStatus (Waiting veya Solved) olanları getiriyoruz
  const q = query(
    collection(db, "issues"), 
    where("Status", "==", targetStatus),
    orderBy("CreatedAt", "desc")
  );

  let unsub = null;
  if (!isMockMode) {
    unsub = onSnapshot(q, (snap) => {
        currentIssues = snap.docs.map(d => normalizeIssue({ id: d.id, ...d.data() }));
        refreshList();
      }, (err) => {
        console.error("Issue snapshot error:", err);
      }
    );
  }
  root._unsubIssues = unsub;

  /* ── Mark Resolved ── */
  async function markResolved(issueId) {
    try {
      const payload = buildIssueResolvePayload(); // { Status: "Solved" }
      
      // 1. Firestore Güncelleme
      await updateDoc(doc(db, "issues", issueId), {
        ...payload,
        UpdatedAt: serverTimestamp()
      });

      // 2. Yerel listeden kaldır (Çünkü artık "Waiting" değil, listeden gitmeli)
      currentIssues = currentIssues.filter(i => String(i.id) !== String(issueId));
      refreshList();
      
      console.log(`Issue ${issueId} marked as solved.`);
    } catch (err) {
      console.error("markResolved error:", err);
      alert("Failed to resolve issue.");
    }
  }

  /* ── Render ── */
  function renderIssues(issues) {
    if (!issues.length) {
      listEl.innerHTML = `<div style="font-size:13px;color:#6b7280;padding:20px;text-align:center;">No ${targetStatus.toLowerCase()} issues found.</div>`;
      return;
    }

    listEl.innerHTML = issues.map(i => {
      const prioClass = i.Priority === 'High' ? 'prio-high' : i.Priority === 'Low' ? 'prio-low' : 'prio-medium';
      
      // Sadece 'view' modundaysak buton gösterilecek
      const showAction = mode === 'view' && i.Status === 'Waiting';

      return `
        <div class="issue-card ${i.Status === 'Solved' ? 'issue-card--solved' : ''}">
          <div class="issue-card-header">
            <strong>${escapeHtml(i.Title)}</strong>
            <span class="issue-prio ${prioClass}">${escapeHtml(i.Priority)}</span>
          </div>
          <div class="issue-card-desc">${escapeHtml(i.Description)}</div>
          <div class="issue-card-meta">
            <span>Facility: ${escapeHtml(i.Facility || '-')}</span>
            <span class="issue-status status-${i.Status?.toLowerCase()}">${escapeHtml(i.Status)}</span>
          </div>
          ${showAction ? `
            <div class="issue-actions">
              <button class="btn btn-sm btn-primary" data-action="resolve" data-id="${escapeHtml(i.id)}">Mark Solved</button>
            </div>` : ''}
        </div>`;
    }).join("");

    listEl.querySelectorAll('button[data-action="resolve"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        markResolved(btn.dataset.id);
      });
    });
  }

  function escapeHtml(str) {
    return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
}