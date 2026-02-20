const nav = document.getElementById("adminNav");
const viewRoot = document.getElementById("viewRoot");
const pageTitle = document.getElementById("pageTitle");
const logoutBtn = document.getElementById("logoutBtn");

const views = {

    "remove-station": () => `
    <div id="removeStationRoot"></div>
  `,

    "add-station": () => `
    <div id="addStationRoot"></div>
  `,

    "block-carrier": () => `
    <div id="blockCarrierRoot"></div>
  `,

    "report": () => `
    <div id="viewReportRoot"></div>
  `,

    "facility-edit": () => `
    <div id="facilityEditRoot"></div>
  `,

    "stats": () => `
    <div id="facilityStatsRoot"></div>
  `,

    "issue-form": () => `
    <div id="issueFormRoot"></div>
  `,
    "solve-issue": () => `
    <div id="solveIssueRoot"></div>
  `
    , "manage-users": () => `
    <div id="manageUsersRoot"></div>
  `
    , "pending-applications": () => `
    <div id="pendingApplicationsRoot"></div>
  `
};

function setActive(viewKey) {
    // aktif class
    nav.querySelectorAll(".nav-item").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.view === viewKey);
    });

    // başlık
    const activeBtn = nav.querySelector(`.nav-item[data-view="${viewKey}"]`);
    pageTitle.textContent = activeBtn ? activeBtn.innerText.trim() : "Admin";

    const render = views[viewKey];
    viewRoot.innerHTML = render();
    
    if (viewKey === 'remove-station') {
        import('./removeStation.js')
            .then(mod => {
                const root = document.getElementById('removeStationRoot');
                if (root && mod.initRemoveStation) mod.initRemoveStation(root);
            })
            .catch(err => console.error('removeStation load error', err));
    }
 
    if (viewKey === 'add-station') {
    import('./addStation.js')
      .then(mod => {
        const root = document.getElementById('addStationRoot');
        if (root && mod.initAddStation) mod.initAddStation(root);
      })
      .catch(err => console.error('addStation load error', err));
  }

  if (viewKey === 'block-carrier') {
    import('./blockCarrier.js')
      .then(mod => {
        const root = document.getElementById('blockCarrierRoot');
        if (root && mod.initBlockCarrier) mod.initBlockCarrier(root);
      })
      .catch(err => console.error('blockCarrier load error', err));
  }

  if (viewKey === 'issue-form') {
    import('./issueForm.js')
      .then(mod => {
        const root = document.getElementById('issueFormRoot');
        if (root && mod.initIssueForm) mod.initIssueForm(root, { mode: 'view' });
      })
      .catch(err => console.error('issueForm load error', err));
  }

  if (viewKey === 'solve-issue') {
    import('./issueForm.js')
      .then(mod => {
        const root = document.getElementById('solveIssueRoot');
        if (root && mod.initIssueForm) mod.initIssueForm(root, { mode: 'solve' });
      })
      .catch(err => console.error('issueForm load error', err));
  }

  if (viewKey === 'manage-users') {
    import('./manageUsers.js')
      .then(mod => {
        const root = document.getElementById('manageUsersRoot');
        if (root && mod.initManageUsers) mod.initManageUsers(root);
      })
      .catch(err => console.error('manageUsers load error', err));
  }

  if (viewKey === 'pending-applications') {
    import('./pendingApplications.js')
      .then(mod => {
        const root = document.getElementById('pendingApplicationsRoot');
        if (root && mod.initPendingApplications) mod.initPendingApplications(root);
      })
      .catch(err => console.error('pendingApplications load error', err));
  }
}

nav.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  setActive(btn.dataset.view);
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("admin_session");
  window.location.href = "./login.html";
});
