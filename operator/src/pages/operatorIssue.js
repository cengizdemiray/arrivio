// js/pages/operatorIssue.js
import { db } from '../sevices/firebaseClient.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { validateIssueInput, buildIssueDocument, isIssueResolved } from '../services/operatorServices.js';

export async function renderIssueCreateView(root, deps) {
  const {
    loadQueueStations,
    loadIssues,
    formatNow,
    getCachedIssues = () => [],
    setCachedIssues = () => {}
  } = deps || {};

  root.innerHTML = `<div class="card" style="padding:20px;">Loading stations...</div>`;
  await loadQueueStations?.();
  await loadIssues?.(true);

  root.innerHTML = `
    <div class="operator-hero">
      <div class="hero-row">
        <div>
          <div class="hero-title">Create Issue</div>
          <p class="hero-sub">Create and send an issue. It will appear in admin panel after approval.</p>
        </div>
      </div>
    </div>

    <div class="issue-create-layout">
      <div class="issue-create-main">
        <div class="form-card">
          <h3>New Issue</h3>
          <div class="subtitle">Log operational problems here.</div>
          <form id="issueCreateForm" class="form-grid two">
            <div class="form-col full">
              <label for="issueTitle">Title</label>
              <input id="issueTitle" required placeholder="Scanner failure, power outage, etc." />
            </div>
            <div class="form-col">
              <label for="issueStation">Station</label>
              <select id="issueStation" required></select>
            </div>
            <div class="form-col">
              <label for="issuePriority">Priority</label>
              <select id="issuePriority" required>
                <option>High</option>
                <option selected>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div class="form-col">
              <label for="issueReporter">Reporter</label>
              <input id="issueReporter" value="Operator Desk" />
            </div>
            <div class="form-col full">
              <label for="issueDescription">Description</label>
              <textarea id="issueDescription" placeholder="Short description and observation note"></textarea>
            </div>
            <div class="form-col full form-foot">
              <div id="issueSuccess" class="pill" style="display:none;">Request saved</div>
              <button type="submit" class="btn btn-primary">Create Issue</button>
            </div>
          </form>
        </div>
      </div>
      <aside class="issue-create-side" style="display:none;"></aside>
    </div>
  `;

  const form = root.querySelector('#issueCreateForm');
  const success = root.querySelector('#issueSuccess');
  const recent = root.querySelector('#recentIssues');
  const stationSelect = root.querySelector('#issueStation');
  const recentDetail = root.querySelector('#recentDetail');
  const recentDetailTitle = root.querySelector('#recentDetailTitle');
  const recentDetailMeta = root.querySelector('#recentDetailMeta');
  const recentDetailDesc = root.querySelector('#recentDetailDesc');
  const reporterInput = root.querySelector('#issueReporter');

  const stations = (await loadQueueStations?.()) || [];
  stationSelect.innerHTML = stations.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('');

  function renderRecent(list) {
    recent.innerHTML = '';
    (list || []).slice(0, 4).forEach(i => {
      const statusText = isIssueResolved(i) ? 'Solved' : 'Waiting';
      const li = document.createElement('li');
      li.innerHTML = `<strong>${i.title}</strong><div class="meta">${i.station} - ${i.priority} - ${i.created || ''}</div><div class="meta" style="color:${statusText === 'Solved' ? '#0b6b3a' : '#92400e'};">${statusText}</div>`;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => showRecentDetail(i));
      recent.appendChild(li);
    });
  }

  function showRecentDetail(issue) {
    if (!issue || !recentDetail) return;
    recentDetailTitle.textContent = issue.title;
    const statusText = isIssueResolved(issue) ? 'Solved' : 'Waiting';
    const created = issue.created || '';
    recentDetailMeta.textContent = `${issue.station} - ${statusText} - ${created}`;
    recentDetailDesc.textContent = issue.description || 'No description';
    recentDetail.style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = root.querySelector('#issueTitle').value.trim();
    const station = stationSelect.value;
    const priority = root.querySelector('#issuePriority').value;
    const reporter = reporterInput.value.trim() || 'Operator Desk';
    const description = root.querySelector('#issueDescription').value.trim();

    const validation = validateIssueInput(title, station);
    if (!validation.valid) return;

    const timestamp = formatNow();
    const issueDoc = buildIssueDocument({ title, station, priority, reporter, description, timestamp });

    const newIssue = {
      id: `i${Date.now()}`,
      title: issueDoc.title,
      station: issueDoc.station,
      reporter: issueDoc.reporter,
      created: timestamp,
      priority: issueDoc.priority,
      status: issueDoc.status,
      description: issueDoc.description,
      comments: issueDoc.comments
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      const docRef = await addDoc(collection(db, 'issues'), {
        ...issueDoc,
        CreatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      newIssue.id = docRef.id;
      const next = [newIssue, ...getCachedIssues()];
      setCachedIssues(next);
      success.textContent = 'Request saved';
      success.style.display = 'inline-flex';
      form.reset();
      reporterInput.value = 'Operator Desk';
      renderRecent(next);
      showRecentDetail(newIssue);
    } catch (err) {
      console.error('Issue save failed', err);
      success.textContent = 'Save failed';
      success.style.display = 'inline-flex';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Issue';
    }
  });

  renderRecent(getCachedIssues());
}
