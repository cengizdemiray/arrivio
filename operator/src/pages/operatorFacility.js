// js/pages/operatorFacilityStatus.js
import { db } from '../sevices/firebaseClient.js';
import {
  collection, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * Simplified Facility Status View
 * ─────────────────────────────────
 * Two sections:
 *   1. Facility Info   → read-only card fetched from Firestore "Facility" collection
 *   2. Station List    → each station displayed as an editable card
 *                        (status, type, contact, phone — save per station)
 */
export async function renderFacilityStatusView(root, deps) {
  /**
   * The dependencies from operator.js taken here
   */
  const {
    loadFacility,
    loadQueueStations,
  } = deps || {};

  /* ── loading state ─────────────────────────────────────── */
  root.innerHTML = `<div class="card" style="padding:20px;">Loading facility data...</div>`;

  /* ── fetch facility + stations from Firestore in parallel ── */
  let facility = {};
  let stations = [];
  try {
    const results = await Promise.all([
      loadFacility?.(true) || Promise.resolve({}),
      loadQueueStations?.(true) || Promise.resolve([])
    ]);
    facility = results[0] || {};
    stations = results[1] || [];
  } catch (err) {
    console.error('[FacilityView] Failed to load data:', err);
  }

  console.log('[FacilityView] Loaded facility:', facility);
  console.log('[FacilityView] Loaded stations:', stations.length);

  /* ── station status counts */
  const stationCount = stations.length;
  /**
   * Loop through the stations three time and save the status counts for each station 
   */
  const operational  = stations.filter(s => s.status === 'Operational').length;
  const maintenance  = stations.filter(s => s.status === 'Maintenance').length;
  const paused       = stations.filter(s => s.status === 'Paused').length;

  /* ── facility status pill class ────────────────────────── */
  const facStatus = (facility.status || 'Unknown');
  const facPillClass = facStatus === 'Active' ? 'operational'
                     : facStatus === 'Maintenance' ? 'maintenance'
                     : 'paused';

  /* ── render ─────────────────────────────────────────────── */
  root.innerHTML = `
    <div class="operator-hero">
      <div class="hero-row">
        <div>
          <div class="hero-title">Facility Status</div>
          <p class="hero-sub">View facility info and edit individual station details.</p>
        </div>
      </div>
    </div>

    <!-- SECTION 1 — Facility Info (from Firestore) -->
    <div class="form-card" style="margin-bottom:18px;">
      <div class="card-title">
        <span>Facility Information</span>
        <span class="status-pill ${facPillClass}" style="font-size:12px;padding:4px 12px;margin-left:auto;">${facStatus}</span>
      </div>
      <div class="status-meta">
        <div class="meta-card">
          <div class="label">Name</div>
          <div style="font-weight:700;">${facility.name || '-'}</div>
        </div>
        <div class="meta-card">
          <div class="label">Facility ID</div>
          <div style="font-weight:700;">${facility.facilityId || '-'}</div>
        </div>
        <div class="meta-card">
          <div class="label">Address</div>
          <div style="font-weight:700;">${facility.address || '-'}</div>
        </div>
        <div class="meta-card">
          <div class="label">Capacity</div>
          <div style="font-weight:700;">${facility.capacity || '-'}</div>
        </div>
      </div>
      <!-- station summary row -->
      <div class="status-meta" style="margin-top:10px;">
        <div class="meta-card">
          <div class="label">Total Stations</div>
          <div style="font-weight:700;">${stationCount}</div>
        </div>
        <div class="meta-card">
          <div class="label">Station Status Breakdown</div>
          <div>
            <span class="status-pill operational" style="font-size:12px;padding:4px 10px;">Operational ${operational}</span>
            <span class="status-pill maintenance" style="font-size:12px;padding:4px 10px;">Maintenance ${maintenance}</span>
            <span class="status-pill paused" style="font-size:12px;padding:4px 10px;">Paused ${paused}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION 2 — Station Cards (editable) -->
    <div class="form-card">
      <div class="card-title">
        <span>Stations</span>
      </div>
      <div id="stationCards" style="display:flex; flex-direction:column; gap:14px;">
        ${stations.length === 0
          ? '<p style="color:var(--muted);">No stations found in Firestore.</p>'
          : stations.map((s, i) => renderStationCard(s, i)).join('')}
      </div>
    </div>
  `;

  /* ── attach toggle handlers for collapsible station cards ── */
  stations.forEach((_, i) => {
    const toggle = root.querySelector(`#stToggle${i}`);
    const body   = root.querySelector(`#stBody${i}`);
    const arrow  = root.querySelector(`#stArrow${i}`);
    if (!toggle || !body) return;

    toggle.addEventListener('click', () => {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
    });
  });

  /* ── attach save handlers for every station card ─────── */
  stations.forEach((station, i) => {
    const saveBtn = root.querySelector(`#saveStation${i}`);
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
      const card = root.querySelector(`#stationCard${i}`);
      const newStatus  = card.querySelector(`#stStatus${i}`).value;
      const newType    = card.querySelector(`#stType${i}`).value;
      const newContact = card.querySelector(`#stContact${i}`).value.trim();
      const newPhone   = card.querySelector(`#stPhone${i}`).value.trim();

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const stationDocId = station.id;
        const stationRef = doc(db, 'Station', stationDocId);

        await updateDoc(stationRef, {
          status: newStatus === 'Operational' ? 'active'
                : newStatus === 'Maintenance' ? 'maintenance'
                : 'inactive',
          type: newType,
          contactName: newContact,
          phone: newPhone
        });

        // Update local cache
        station.status = newStatus;

        // Update the header pill to reflect the saved status
        const pill = root.querySelector(`#stPill${i}`);
        if (pill) {
          pill.textContent = newStatus;
          pill.className = 'status-pill '
            + (newStatus === 'Operational' ? 'operational'
             : newStatus === 'Maintenance' ? 'maintenance'
             : 'paused');
        }

        saveBtn.textContent = 'Saved ✓';
        saveBtn.style.background = '#ecfdf3';
        saveBtn.style.color = '#166534';
        setTimeout(() => {
          saveBtn.textContent = 'Save';
          saveBtn.style.background = '';
          saveBtn.style.color = '';
          saveBtn.disabled = false;
        }, 1500);

        // Refresh the station summary counts
        refreshStationCounts(root, stations);
      } catch (err) {
        console.error('Failed to update station', err);
        saveBtn.textContent = 'Error';
        saveBtn.style.background = '#fef2f2';
        saveBtn.style.color = '#991b1b';
        setTimeout(() => {
          saveBtn.textContent = 'Save';
          saveBtn.style.background = '';
          saveBtn.style.color = '';
          saveBtn.disabled = false;
        }, 2000);
      }
    });
  });
}

/* ── helper: single station card HTML ─────────────────── */
function renderStationCard(station, index) {
  const statusOptions = ['Operational', 'Maintenance', 'Paused'];
  const typeOptions   = ['Load', 'Unload'];

  const pillClass = station.status === 'Operational' ? 'operational'
                  : station.status === 'Maintenance' ? 'maintenance'
                  : 'paused';

  return `
    <div id="stationCard${index}" class="station-card" style="cursor:default;">
      <!-- clickable header row — toggles the body -->
      <div id="stToggle${index}" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span id="stArrow${index}" style="font-size:14px; color:var(--muted); transition:transform .2s;">&#9654;</span>
          <div>
            <div class="title">${station.name || station.code}</div>
            <div class="meta" style="margin-top:4px;">Code: ${station.code}</div>
          </div>
        </div>
        <span id="stPill${index}" class="status-pill ${pillClass}" style="font-size:13px;">${station.status}</span>
      </div>

      <!-- collapsible body — hidden by default -->
      <div id="stBody${index}" style="display:none; margin-top:12px;">
        <div class="form-grid two">
          <div class="form-col">
            <label for="stStatus${index}">Status</label>
            <select id="stStatus${index}">
              ${statusOptions.map(o => `<option value="${o}" ${o === station.status ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-col">
            <label for="stType${index}">Type</label>
            <select id="stType${index}">
              ${typeOptions.map(o => `<option value="${o}" ${o === (station.type || '') ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-col">
            <label for="stContact${index}">Contact Name</label>
            <input id="stContact${index}" value="${station.contactName || ''}" placeholder="Manager name" />
          </div>
          <div class="form-col">
            <label for="stPhone${index}">Phone</label>
            <input id="stPhone${index}" value="${station.phone || ''}" placeholder="Phone number" />
          </div>
        </div>

        <div class="bottom-actions" style="justify-content:flex-end; margin-top:10px;">
          <button id="saveStation${index}" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  `;
}

/* ── helper: refresh station summary counts after a save ── */
function refreshStationCounts(root, stations) {
  const summaryMeta = root.querySelectorAll('.status-meta')[1];
  if (!summaryMeta) return;

  const cards = summaryMeta.querySelectorAll('.meta-card');
  if (cards.length < 2) return;

  const op = stations.filter(s => s.status === 'Operational').length;
  const mt = stations.filter(s => s.status === 'Maintenance').length;
  const pa = stations.filter(s => s.status === 'Paused').length;

  cards[0].querySelector('div:last-child').textContent = stations.length;
  cards[1].querySelector('div:last-child').innerHTML = `
    <span class="status-pill operational" style="font-size:12px;padding:4px 10px;">Operational ${op}</span>
    <span class="status-pill maintenance" style="font-size:12px;padding:4px 10px;">Maintenance ${mt}</span>
    <span class="status-pill paused" style="font-size:12px;padding:4px 10px;">Paused ${pa}</span>
  `;
}
