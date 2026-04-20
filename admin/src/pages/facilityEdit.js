// js/pages/facilityEdit.js
import { auth, db } from "../app/config.js";
import {
  collection, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { buildFacilityUpdate } from "../services/adminServices.js";
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Edit Facility Info — Admin Page
 * ────────────────────────────────
 * Card 1: Editable facility form  (Name, Address, Capacity, Status, Contact, Hours)
 * Card 2: Read-only overview      (station count, status breakdown, queue count)
 */
export async function initFacilityEdit(root) {

  root.innerHTML = `<div style="padding:20px; color:var(--muted);">Loading facility data...</div>`;

  /* ── fetch Facility + Station collections in parallel ── */
  let facility = null;
  let facilityDocId = null;
  let stations = [];

  try {
    const [facSnap, stSnap, queueSnap] = await Promise.all([
      getDocs(collection(db, 'Facility')),
      getDocs(collection(db, 'Station')),
      getDocs(collection(db, 'QueueEntry'))
    ]);

    // ── Facility document ──
    if (!facSnap.empty) {
      const d = facSnap.docs[0];
      facilityDocId = d.id;
      const data = d.data() || {};
      facility = {
        name:         data.Name           || data.name           || '',
        facilityId:   data.Facility_ID    || data.facilityId     || '',
        address:      data.Adress         || data.Address || data.address || '',
        capacity:     data.Capacity       || data.capacity       || '',
        status:       (data.Status        || data.status         || 'Active').replace(/'/g, ''),
        contactName:  data.contactName    || data.ContactName    || '',
        phone:        data.phone          || data.Phone          || '',
        timezone:     data.timezone       || data.Timezone       || '',
        weekdayStart: data.weekdayStart   || data.WeekdayStart   || '',
        weekdayEnd:   data.weekdayEnd     || data.WeekdayEnd     || '',
        weekendStart: data.weekendStart   || data.WeekendStart   || '',
        weekendEnd:   data.weekendEnd     || data.WeekendEnd     || ''
      };
    }

    // ── Stations list ──
    // Count queue entries per station
    const queueByStation = new Map();
    (queueSnap.docs || []).forEach(qd => {
      const qData = qd.data() || {};
      const sid = qData.stationId || qData.StationId || '';
      const status = (qData.queueStatus || '').toLowerCase().trim();
      if (!sid || status !== 'queued') return;
      queueByStation.set(sid, (queueByStation.get(sid) || 0) + 1);
    });

    stations = (stSnap.docs || []).map(sd => {
      const data = sd.data() || {};
      const id = data.stationId || data.StationId || sd.id;
      const rawStatus = (data.status || 'active').toLowerCase();
      const status = rawStatus === 'active' || rawStatus === 'operational' ? 'Operational'
                   : rawStatus === 'maintenance' ? 'Maintenance'
                   : 'Paused';
      return { id, status, queueCount: queueByStation.get(id) || 0 };
    });

  } catch (err) {
    console.error('[FacilityEdit] Load error:', err);
    root.innerHTML = `<div class="alert alert-error">Failed to load facility data. Check console for details.</div>`;
    return;
  }

  if (!facility) {
    root.innerHTML = `<div class="alert alert-error">No Facility document found in Firestore.</div>`;
    return;
  }

  /* ── computed overview values ──────────────────────── */
  const totalStations   = stations.length;
  const opCount         = stations.filter(s => s.status === 'Operational').length;
  const maintCount      = stations.filter(s => s.status === 'Maintenance').length;
  const pausedCount     = stations.filter(s => s.status === 'Paused').length;
  const totalInQueue    = stations.reduce((sum, s) => sum + s.queueCount, 0);

  /* ── status options ───────────────────────────────── */
  const statusOptions = ['Active', 'Maintenance', 'Paused', 'Closed'];

  /* ── render ────────────────────────────────────────── */
  root.innerHTML = `
    <div class="facility-root">

      <!-- Hero -->
      <div class="page-hero" style="margin-bottom:14px;">
        <div class="hero-inner">
          <div class="hero-icon">⚙</div>
          <div>
            <div class="hero-title">Edit Facility Info</div>
            <div class="hero-sub">Update facility details, operating hours, and contact information.</div>
          </div>
        </div>
      </div>

      <div class="fac-edit-layout">

        <!-- CARD 1 — Editable form -->
        <div class="fac-edit-form">
          <div class="form-card">
            <h3>Facility Details</h3>
            <p class="subtitle">Core information about this facility.</p>

            <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-row">
                <label>Facility Name</label>
                <input id="facName" value="${escapeAttr(facility.name)}" placeholder="Facility name" />
              </div>
              <div class="form-row">
                <label>Facility ID</label>
                <input id="facId" value="${escapeAttr(facility.facilityId)}" disabled
                       style="background:#f3f4f6; cursor:not-allowed;" />
              </div>
              <div class="form-row">
                <label>Address</label>
                <input id="facAddress" value="${escapeAttr(facility.address)}" placeholder="Facility address" />
              </div>
              <div class="form-row">
                <label>Capacity</label>
                <input id="facCapacity" type="number" min="1" value="${facility.capacity}" placeholder="Max trucks" />
              </div>
              <div class="form-row">
                <label>Status</label>
                <select id="facStatus">
                  ${statusOptions.map(o => `<option value="${o}" ${o === facility.status ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
              </div>
              <div class="form-row">
                <label>Timezone</label>
                <input id="facTimezone" value="${escapeAttr(facility.timezone)}" disabled
                       style="background:#f3f4f6; cursor:not-allowed;" />
              </div>
            </div>
          </div>

          <div class="form-card" style="margin-top:14px;">
            <h3>Contact Information</h3>
            <p class="subtitle">Primary contact for this facility.</p>
            <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-row">
                <label>Contact Name</label>
                <input id="facContact" value="${escapeAttr(facility.contactName)}" placeholder="Manager name" />
              </div>
              <div class="form-row">
                <label>Phone</label>
                <input id="facPhone" value="${escapeAttr(facility.phone)}" placeholder="Phone number" />
              </div>
            </div>
          </div>

          <div class="form-card" style="margin-top:14px;">
            <h3>Operating Hours</h3>
            <p class="subtitle">When is this facility open for service?</p>
            <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-row">
                <label>Weekday Start</label>
                <input id="facWdStart" type="time" value="${facility.weekdayStart}" />
              </div>
              <div class="form-row">
                <label>Weekday End</label>
                <input id="facWdEnd" type="time" value="${facility.weekdayEnd}" />
              </div>
              <div class="form-row">
                <label>Weekend Start</label>
                <input id="facWeStart" type="time" value="${facility.weekendStart}" />
              </div>
              <div class="form-row">
                <label>Weekend End</label>
                <input id="facWeEnd" type="time" value="${facility.weekendEnd}" />
              </div>
            </div>
          </div>

          <div class="form-actions" style="margin-top:14px;">
            <button id="facSaveBtn" class="btn btn-primary">Save Changes</button>
            <span id="facSaveMsg" style="margin-left:12px; font-weight:600;"></span>
          </div>
        </div>

        <!-- CARD 2 — Read-only overview -->
        <div class="fac-edit-overview">
          <div class="form-card">
            <h3>Facility Overview</h3>
            <p class="subtitle">Live summary — read only.</p>

            <div class="fac-kpi-grid">
              <div class="fac-kpi">
                <div class="fac-kpi-label">Total Stations</div>
                <div class="fac-kpi-value">${totalStations}</div>
              </div>
              <div class="fac-kpi">
                <div class="fac-kpi-label">In Queue Now</div>
                <div class="fac-kpi-value">${totalInQueue}</div>
              </div>
              <div class="fac-kpi">
                <div class="fac-kpi-label">Operational</div>
                <div class="fac-kpi-value" style="color:#166534;">${opCount}</div>
              </div>
              <div class="fac-kpi">
                <div class="fac-kpi-label">Maintenance</div>
                <div class="fac-kpi-value" style="color:#991b1b;">${maintCount}</div>
              </div>
              <div class="fac-kpi">
                <div class="fac-kpi-label">Paused</div>
                <div class="fac-kpi-value" style="color:#9a3412;">${pausedCount}</div>
              </div>
              <div class="fac-kpi">
                <div class="fac-kpi-label">Capacity</div>
                <div class="fac-kpi-value">${facility.capacity || '-'}</div>
              </div>
            </div>
          </div>

          <div class="form-card" style="margin-top:14px;">
            <h3>Station List</h3>
            <div class="fac-station-list">
              ${stations.length === 0
                ? '<div style="color:var(--muted);">No stations found.</div>'
                : stations.map(s => {
                    const cls = s.status === 'Operational' ? 'badge-green'
                              : s.status === 'Maintenance' ? 'badge-red'
                              : 'badge-amber';
                    return `
                      <div class="fac-station-row">
                        <span style="font-weight:700;">${s.id}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="color:var(--muted); font-size:13px;">Queue: ${s.queueCount}</span>
                          <span class="fac-badge ${cls}">${s.status}</span>
                        </div>
                      </div>`;
                  }).join('')}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  /* ── save handler ──────────────────────────────────── */
  const saveBtn = root.querySelector('#facSaveBtn');
  const saveMsg = root.querySelector('#facSaveMsg');

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    saveMsg.textContent = '';

    const updates = buildFacilityUpdate({
      name:         root.querySelector('#facName').value,
      address:      root.querySelector('#facAddress').value,
      capacity:     root.querySelector('#facCapacity').value,
      status:       root.querySelector('#facStatus').value,
      contactName:  root.querySelector('#facContact').value,
      phone:        root.querySelector('#facPhone').value,
      weekdayStart: root.querySelector('#facWdStart').value,
      weekdayEnd:   root.querySelector('#facWdEnd').value,
      weekendStart: root.querySelector('#facWeStart').value,
      weekendEnd:   root.querySelector('#facWeEnd').value
    });

    try {
      await updateDoc(doc(db, 'Facility', facilityDocId), updates);

      saveBtn.textContent = 'Saved ✓';
      saveBtn.style.background = '#ecfdf3';
      saveBtn.style.color = '#166534';
      saveMsg.style.color = '#166534';

      setTimeout(() => {
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.background = '';
        saveBtn.style.color = '';
        saveBtn.disabled = false;
      }, 1500);

    } catch (err) {
      console.error('[FacilityEdit] Save error:', err);
      saveBtn.textContent = 'Save Changes';
      saveBtn.disabled = false;
      saveMsg.textContent = 'Save failed — check console.';
      saveMsg.style.color = '#991b1b';
    }
  });
}
