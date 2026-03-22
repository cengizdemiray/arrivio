import { auth, db } from "../app/config.js";
import { issues as mockIssues } from "../../data/mockIssues.js";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

export function initIssueForm(root, options = {}) {
  const mode = options.mode || "self";
  const isMockMode = options.mock === true;

  const showCreate = mode === "self";
  root.innerHTML = `
    <div class="issue-layout ${showCreate ? "" : "issue-layout--list-only"}">
      ${
        showCreate
          ? `
        <div class="issue-form">
          <h3>Create Issue</h3>

          <div class="form-row">
            <label>Title</label>
            <input id="issueTitle" type="text" placeholder="Issue title" />
          </div>

          <div class="form-row">
            <label>Description</label>
            <textarea id="issueDesc" placeholder="Describe the issue..."></textarea>
          </div>

          <div class="form-row">
            <label>Facility</label>
            <input id="issueFacility" type="text" placeholder="Facility name" />
          </div>

          <div class="form-row">
            <label>Priority</label>
            <select id="issuePriority">
              <option value="Low">Low</option>
              <option value="Medium" selected>Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <button id="submitIssueBtn" class="btn btn-primary">Submit Issue</button>
          <div id="formMsg" style="margin-top:10px;font-size:13px;"></div>
        </div>
        `
          : ``
      }

      <div class="issue-list">
        <h3 id="issueListTitle">My Issues</h3>
        <div id="issueList"></div>
      </div>
    </div>
  `;

  const titleEl = root.querySelector("#issueTitle");
  const descEl = root.querySelector("#issueDesc");
  const facilityEl = root.querySelector("#issueFacility");
  const priorityEl = root.querySelector("#issuePriority");
  const submitBtn = root.querySelector("#submitIssueBtn");
  const formMsg = root.querySelector("#formMsg");
  const listEl = root.querySelector("#issueList");
  const listTitle = root.querySelector("#issueListTitle");
  let currentIssues = [];

  if (mode === "view") listTitle.textContent = "All Issues";
  if (mode === "solve") listTitle.textContent = "Solved Issues";

  const setMsg = (msg = "", type = "info") => {
    if (!formMsg) return;
    formMsg.textContent = msg;
    formMsg.style.color =
      type === "error" ? "#b42318" :
      type === "success" ? "#027a48" :
      "#344054";
  };

  async function submitIssue() {
    setMsg("");

    const user = auth.currentUser;
    if (!user) {
      setMsg("Not logged in.", "error");
      return;
    }

    const title = titleEl.value.trim();
    const description = descEl.value.trim();
    const facility = facilityEl.value.trim();
    const priority = priorityEl.value;

    if (!title || !description) {
      setMsg("Title and description are required.", "error");
      return;
    }

    try {
      setMsg("Submitting...", "info");

      await addDoc(collection(db, "issues"), {
        Title: title,
        Description: description,
        Facility: facility,
        Priority: priority,
        Status: "Waiting",

        CreatedByUid: user.uid,
        Role: "Operator",
        CreatedAt: serverTimestamp()
      });

      titleEl.value = "";
      descEl.value = "";
      facilityEl.value = "";
      priorityEl.value = "Medium";

      setMsg("Issue created successfully", "success");
    } catch (err) {
      console.error("Issue create error:", err);
      setMsg(err?.message || "Failed to create issue.", "error");
    }
  }

  if (showCreate && submitBtn) {
    submitBtn.addEventListener("click", submitIssue);
  }

  const q = query(collection(db, "issues"), orderBy("CreatedAt", "desc"));

  let unsub = null;
  if (!isMockMode) {
    unsub = onSnapshot(
      q,
      (snap) => {
        const user = auth.currentUser;
        currentIssues = snap.docs.map((d) => normalizeIssue({ id: d.id, ...d.data() }));
        renderIssues(applyIssueFilters(currentIssues, user));
      },
      (err) => {
        console.error("Issue snapshot error:", err);
        currentIssues = (mockIssues || []).map(normalizeIssue);
        renderIssues(applyIssueFilters(currentIssues, auth.currentUser));
      }
    );
  } else {
    currentIssues = (mockIssues || []).map(normalizeIssue);
    renderIssues(applyIssueFilters(currentIssues, auth.currentUser));
  }

  root._unsubIssues = unsub;

  if (mode === "self" && !auth.currentUser && isMockMode) {
    currentIssues = (mockIssues || []).map(normalizeIssue);
    renderIssues(applyIssueFilters(currentIssues, null));
  }

  function normalizeIssue(raw) {
    return {
      id: raw.id || raw.Id || raw.issueId || "-",
      Title: raw.Title ?? raw.title ?? "Untitled",
      Description: raw.Description ?? raw.description ?? "",
      Facility: raw.Facility ?? raw.station ?? raw.facility ?? "",
      Priority: raw.Priority ?? raw.priority ?? "Medium",
      Status: raw.Status ?? raw.status ?? "Waiting",
      CreatedByUid: raw.CreatedByUid ?? raw.createdByUid ?? raw.reporterUid ?? null,
      _raw: raw
    };
  }

  function applyIssueFilters(items, user) {
    let list = items;
    if (mode === "self" && user) {
      list = list.filter((i) => i.CreatedByUid === user.uid);
    }
    if (mode === "view") {
      list = list.filter((i) => !["resolved", "closed", "solved"].includes(String(i.Status || "").toLowerCase()));
    }
    if (mode === "solve") {
      list = list.filter((i) => ["resolved", "closed", "solved"].includes(String(i.Status || "").toLowerCase()));
    }
    return list;
  }

  async function markResolved(issueId, commentText = "") {
    if (isMockMode) {
      const target = mockIssues.find((i) => String(i.id || i.Id || i.issueId) === String(issueId));
      if (target) {
        target.status = "Solved";
        target.Status = "Solved";
        const comment = (commentText || "").trim();
        if (comment) {
          if (!Array.isArray(target.comments)) target.comments = [];
          target.comments.push({ by: "Admin", text: comment, time: new Date().toISOString() });
        }
      }
      currentIssues = mockIssues.map(normalizeIssue);
      renderIssues(applyIssueFilters(currentIssues, auth.currentUser));
      return;
    }

    try {
      if (formMsg) setMsg("Updating issue...", "info");
      await updateDoc(doc(db, "issues", issueId), {
        Status: "Solved",

        UpdatedAt: serverTimestamp()
      });

      // Optimistic UI update so item immediately leaves "view" and appears in "solve".
      currentIssues = currentIssues.map((i) =>
        String(i.id) === String(issueId)
          ? { ...i, Status: "Solved", _raw: { ...(i._raw || {}), Status: "Solved" } }
          : i
      );
      renderIssues(applyIssueFilters(currentIssues, auth.currentUser));

      if (formMsg) setMsg("Issue solved", "success");
    } catch (err) {
      console.error("markResolved error:", err);
      if (formMsg) setMsg(err?.message || "Failed to resolve issue.", "error");
    }
  }

  function renderIssues(issues) {
    if (!issues.length) {
      listEl.innerHTML = `<div style="font-size:13px;color:#6b7280">No issues yet.</div>`;
      return;
    }

    listEl.innerHTML = issues
      .map(
        (i) => `
          <div class="issue-card">
            <strong>${escapeHtml(i.Title)}</strong>
            <div style="font-size:13px">${escapeHtml(i.Description)}</div>
            <div style="font-size:12px;color:#6b7280">
              Facility: ${escapeHtml(i.Facility || "-")} |
              Priority: ${escapeHtml(i.Priority)} |
              Status: ${escapeHtml(i.Status)}
            </div>
            ${
              mode === "view" && !["resolved", "closed", "solved"].includes(String(i.Status || "").toLowerCase())
                ? `
                  <div class="issue-actions">
                    <textarea class="issue-comment" placeholder="Add comment..."></textarea>
                    <button class="btn btn-sm btn-primary" data-action="resolve" data-id="${escapeHtml(i.id)}">Mark Solved</button>
                  </div>
                `
                : ""
            }
          </div>
        `
      )
      .join("");

    listEl.querySelectorAll('button[data-action="resolve"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".issue-card");
        const commentEl = card ? card.querySelector(".issue-comment") : null;
        const comment = commentEl ? commentEl.value : "";
        markResolved(btn.dataset.id, comment);
      });
    });
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
