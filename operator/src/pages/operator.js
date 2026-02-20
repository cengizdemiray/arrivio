// js/pages/operator.js
import { db } from '../sevices/firebaseClient.js';
import { collection, getDocs, getDoc, doc, query, where, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { renderIssueCreateView } from './operatorIssue.js';
import { renderFacilityStatusView } from './operatorFacility.js';
import { renderQueueManagerView } from './operatorQueue.js';
import { renderProfileView } from './operatorProfile.js';

const mockIssues = [];
const mockFacility = {};

const nav = document.getElementById('operatorNav');
const viewRoot = document.getElementById('viewRoot');
const pageTitle = document.getElementById('pageTitle');
const logoutBtn = document.getElementById('logoutBtn');

let currentViewKey = 'issue-create';

let cachedStations = [];
let cachedIssues = [];
let cachedFacility = null;
let currentOperatorId = localStorage.getItem('operator_user_id') || null;
let currentOperatorName = localStorage.getItem('operator_user_name') || null;
let currentOperatorEmail = localStorage.getItem('operator_user_email') || null;
let focusedStation = safeParseFocus(localStorage.getItem('operator_focus_station'));
const hasSession = localStorage.getItem('operator_session') === 'true';

function safeParseFocus(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Simple timestamp helper used across views
function formatNow() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function getCurrentOperator() {
  if (!hasSession) return null;
  const fallbackName = 'Operator';
  const derivedName = currentOperatorName || (currentOperatorEmail ? currentOperatorEmail.split('@')[0] : '');
  const operatorId = currentOperatorId || 'auth-user';
  return {
    id: operatorId,
    name: derivedName || fallbackName,
    email: currentOperatorEmail || ''
  };
}

function setCurrentOperator({ id, name, email } = {}) {
  if (!id && !name && !email) return;
  if (id) {
    currentOperatorId = id;
    localStorage.setItem('operator_user_id', id);
  }
  if (name) {
    currentOperatorName = name;
    localStorage.setItem('operator_user_name', name);
  }
  if (email) {
    currentOperatorEmail = email;
    localStorage.setItem('operator_user_email', email);
  }
  cachedStations = [];
  cachedIssues = [];
  cachedFacility = null;
  setActive(currentViewKey);
}

function getAssignedStations() {
  return cachedStations;
}

function getFocusedStation() {
  return focusedStation;
}

function setFocusedStation(station = null) {
  if (!station || (!station.id && !station.code)) {
    focusedStation = null;
    localStorage.removeItem('operator_focus_station');
    renderProfileBar();
    return;
  }
  focusedStation = {
    id: station.id || station.code,
    code: station.code || station.id || '',
    name: station.name || station.code || station.id || 'Station'
  };
  localStorage.setItem('operator_focus_station', JSON.stringify(focusedStation));
  renderProfileBar();
}

// Enforce operator session and role before showing the panel
if (!hasSession || !getCurrentOperator()) {
  window.location.href = './login.html';
}

function setActive(viewKey) {
  currentViewKey = viewKey;
  // Highlight selected nav item
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === viewKey);
  });

  const activeBtn = nav.querySelector(`.nav-item[data-view="${viewKey}"]`);
  pageTitle.textContent = activeBtn ? activeBtn.innerText.trim() : 'Operator';

  viewRoot.innerHTML = '';
  renderProfileBar();

  if (viewKey === 'issue-create') {
    // Render issue creation view
    renderIssueCreateView(viewRoot, {
      loadQueueStations,
      loadIssues,
      formatNow,
      getCachedIssues: () => cachedIssues,
      setCachedIssues: (next) => { cachedIssues = next; }
    });
  } else if (viewKey === 'facility-status') {
    // Render facility status controls
    renderFacilityStatusView(viewRoot, {
      loadFacility,
      formatNow,
      loadQueueStations,
      getCachedStations: () => cachedStations,
      getCachedFacility: () => cachedFacility,
      setCachedFacility: (next) => { cachedFacility = next; }
    });
  } else if (viewKey === 'queue-manager') {
    // Render queue manager
    renderQueueManagerView(viewRoot, {
      loadQueueStations,
      loadStationQueue,
      arriveQueueBooking,
      completeQueueBooking,
      formatNow,
      getCachedStations: () => cachedStations,
      setCachedStations: (next) => { cachedStations = next; },
      getFocusedStation,
      onStationFocusChange: setFocusedStation
    });
  } else if (viewKey === 'profile') {
    renderProfileView(viewRoot, {
      getCurrentOperator,
      loadQueueStations,
      getFocusedStation,
      setFocusedStation,
      formatNow
    });
  } else {
    viewRoot.innerHTML = `<p>This view is not ready yet.</p>`;
  }
}

function renderProfileBar() {
  const header = document.querySelector('.content-header');
  if (!header) return;
  let info = document.getElementById('operatorProfile');
  if (!info) {
    info = document.createElement('div');
    info.id = 'operatorProfile';
    info.style.display = 'flex';
    info.style.alignItems = 'center';
    info.style.gap = '16px';
    info.style.marginTop = '8px';
    info.style.padding = '12px 16px';
    info.style.border = '1px solid var(--border, #e5e7eb)';
    info.style.borderRadius = '14px';
    info.style.background = 'var(--card)';
    info.style.boxShadow = 'var(--shadow-soft)';
    header.appendChild(info);
  }

  const op = getCurrentOperator();
  const initials = (op?.name || 'O').split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
  const displayName = op?.name || 'Operator';
  info.innerHTML = `
    <div style="flex:1; display:flex; align-items:flex-start; gap:12px;">
      <div style="width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#0ea5a4,#f97316);color:#0f172a;display:grid;place-items:center;font-weight:800;font-size:18px;box-shadow:0 12px 26px rgba(14,165,164,0.22);">${initials}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="font-weight:800;font-size:20px;color:var(--text);">Hello, ${displayName}</div>
      </div>
    </div>
  `;
}

nav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  if (!btn.dataset.view) return;
  setActive(btn.dataset.view);
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('admin_session');
  localStorage.removeItem('operator_session');
  localStorage.removeItem('operator_user_id');
  localStorage.removeItem('operator_user_name');
  localStorage.removeItem('operator_user_email');
  localStorage.removeItem('operator_focus_station');
  window.location.href = './login.html';
});

// default view
setActive('issue-create');

async function loadQueueStations(force = false) {
  if (cachedStations.length && !force) return cachedStations;
  const fromDb = await fetchStationsFromFirestore();
  cachedStations = Array.isArray(fromDb) ? JSON.parse(JSON.stringify(fromDb)) : [];
  return cachedStations;
}

async function loadIssues(force = false) {
  if (cachedIssues.length && !force) return cachedIssues;
  const allowedStations = getAssignedStations().map(s => s.code);
  cachedIssues = JSON.parse(JSON.stringify(mockIssues))
    .filter(i => !allowedStations.length || allowedStations.includes(i.station));
  cachedIssues.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return cachedIssues;
}

async function loadFacility(force = false) {
  if (cachedFacility && !force) return cachedFacility;
  cachedFacility = { ...mockFacility };
  return cachedFacility;
}

async function loadStationQueue(stationId) {
  if (!stationId) return null;
  const fromDb = await fetchStationQueueFromFirestore(stationId);
  if (fromDb) return fromDb;
  const fallback = cachedStations.find(s => s.id === stationId);
  if (!fallback) return null;
  return {
    queue: Array.isArray(fallback.queue) ? fallback.queue : [],
    history: Array.isArray(fallback.history) ? fallback.history : [],
    inServiceCount: fallback.inServiceCount || 0
  };
}

// expose setters for other modules if needed
export const operatorState = {
  setCurrentOperator,
  getCurrentOperator,
  getAssignedStations,
  formatNow
};

async function fetchStationsFromFirestore() {
  try {
    const stationsSnap = await loadStationsSnapshot();
    const queueSnap = await loadQueueEntriesSnapshot();
    const queueEntriesByStation = buildQueueEntriesByStation(queueSnap.docs || []);

    return stationsSnap.docs.map(docSnap => {
      const data = docSnap.data() || {};
      const stationId = data.stationId || data.StationId || docSnap.id;
      const stationQueueEntries = queueEntriesByStation.get(stationId) || [];
      const activeQueue = stationQueueEntries.filter(entry => isActiveQueueStatus(entry.status));
      const inServiceCount = stationQueueEntries.filter(entry => normalizeQueueStatus(entry.status) === 'In Service').length;
      const avgServiceTimeMin = Number.isFinite(data.avgServiceTimeMin)
        ? data.avgServiceTimeMin
        : (Number.isFinite(data.avgServiceTime) ? data.avgServiceTime : parseFloat(data.avgServiceTimeMin || data.avgServiceTime || ''));
      return {
        id: stationId,
        code: stationId,
        name: data.name || data.stationName || data.Name || stationId || 'Station',
        status: normalizeStationStatus(data.status),
        eta: data.eta || '',
        avgServiceTimeMin: Number.isFinite(avgServiceTimeMin) ? avgServiceTimeMin : null,
        inServiceCount,
        queue: activeQueue.map(entry => ({
          id: entry.id,
          queueEntryId: entry.id,
          bookingId: entry.bookingId,
          eta: entry.createdAt || '',
          status: normalizeQueueStatus(entry.status)
        })),
        history: Array.isArray(data.history) ? data.history : []
      };
    });
  } catch (err) {
    console.error('Could not load stations from Firestore', err);
    return null;
  }
}

async function loadQueueEntriesSnapshot() {
  try {
    return await getDocs(collection(db, 'QueueEntry'));
  } catch (err) {
    console.error('Could not load QueueEntry snapshot', err);
    return { docs: [] };
  }
}

async function loadStationsSnapshot() {
  const primary = await getDocs(collection(db, 'Station'));
  if (!primary.empty) return primary;
  const fallback = await getDocs(collection(db, 'stations'));
  return fallback;
}

function buildQueueEntriesByStation(queueDocs) {
  const map = new Map();
  queueDocs.forEach(docSnap => {
    const data = docSnap.data() || {};
    const stationId = data.stationId || data.StationId || '';
    if (!stationId) return;
    const entry = {
      id: docSnap.id,
      bookingId: data.bookingId || data.BookingId || data.Booking_ID || '',
      status: data.status || data.Status || '',
      createdAt: data.createdAt || data.CreatedAt || ''
    };
    if (!map.has(stationId)) map.set(stationId, []);
    map.get(stationId).push(entry);
  });
  return map;
}

function normalizeStationStatus(status) {
  if (!status) return 'Operational';
  const normalized = String(status).toLowerCase();
  if (normalized === 'active' || normalized === 'operational') return 'Operational';
  if (normalized === 'maintenance') return 'Maintenance';
  return 'Paused';
}

async function fetchStationQueueFromFirestore(stationId) {
  try {
    const queueEntries = await fetchQueueEntriesByStation(stationId);
    if (queueEntries.length) {
      const bookingIds = Array.from(new Set(queueEntries.map(entry => entry.bookingId).filter(Boolean)));
      const bookingDocs = await Promise.all(
        bookingIds.map(id => getDoc(doc(db, 'Booking', id)))
      );
      const bookingMap = new Map();
      bookingDocs.forEach(docSnap => {
        if (!docSnap.exists()) return;
        bookingMap.set(docSnap.id, docSnap.data() || {});
      });
      const scheduledBookings = await fetchScheduledBookingsForStation(stationId);
      const scheduledItems = scheduledBookings
        .filter(docSnap => docSnap?.exists?.() && !bookingMap.has(docSnap.id))
        .map(docSnap => buildQueueItemFromBookingDoc(docSnap));
      const queue = queueEntries
        .filter(entry => isActiveQueueStatus(entry.status))
        .map(entry => buildQueueItemFromEntry(entry, bookingMap.get(entry.bookingId)));
      if (scheduledItems.length) {
        queue.push(...scheduledItems);
      }
      const history = queueEntries
        .filter(entry => isCompletedStatus(entry.status))
        .map(entry => buildHistoryItemFromEntry(entry, bookingMap.get(entry.bookingId)));
      const inServiceCount = queueEntries.filter(entry => normalizeQueueStatus(entry.status) === 'In Service').length;
      return { queue, history, inServiceCount };
    }
    const scheduledBookings = await fetchScheduledBookingsForStation(stationId);
    if (scheduledBookings.length) {
      return {
        queue: scheduledBookings.map(docSnap => buildQueueItemFromBookingDoc(docSnap)),
        history: [],
        inServiceCount: 0
      };
    }
    const stationRef = doc(db, 'Station', stationId);
    const stationSnap = await getDoc(stationRef);
    if (stationSnap.exists()) {
      const data = stationSnap.data() || {};
      const queue = Array.isArray(data.queue) ? data.queue : null;
      const history = Array.isArray(data.history) ? data.history : null;
      if (queue || history) {
        return {
          queue: queue || [],
          history: history || [],
          inServiceCount: 0
        };
      }
    }
  } catch (err) {
    console.error('Could not load station queue from Firestore', err);
  }
  return null;
}

async function fetchQueueEntriesByStation(stationId) {
  const primary = await getDocs(
    query(collection(db, 'QueueEntry'), where('stationId', '==', stationId))
  );
  if (!primary.empty) {
    return primary.docs.map(docSnap => queueEntryFromDoc(docSnap));
  }
  const fallback = await getDocs(
    query(collection(db, 'QueueEntry'), where('StationId', '==', stationId))
  );
  return fallback.docs.map(docSnap => queueEntryFromDoc(docSnap));
}

function queueEntryFromDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    bookingId: data.bookingId || data.BookingId || data.Booking_ID || '',
    stationId: data.stationId || data.StationId || '',
    status: data.status || data.Status || '',
    createdAt: data.createdAt || data.CreatedAt || ''
  };
}

function buildQueueItemFromEntry(entry, booking = {}) {
  return {
    id: entry.id,
    queueEntryId: entry.id,
    bookingId: entry.bookingId,
    stationId: entry.stationId || booking.stationId || booking.StationId || booking.station || '',
    carrier: booking.carrier || booking.carrierName || booking.Carrier || booking.CarrierName || booking.carrierId || 'Carrier',
    truck: booking.truck || booking.truckPlate || booking.Truck || '',
    trailer: booking.trailer || booking.trailerId || booking.Trailer || '',
    commodity: booking.commodity || booking.Commodity || '',
    eta: booking.Slot || booking.ArrivalTime || booking.ServiceStartTime || entry.createdAt || '',
    status: normalizeQueueStatus(entry.status || booking.Booking_Status || booking.status || 'Waiting')
  };
}

function buildQueueItemFromBookingDoc(docSnap) {
  const booking = docSnap?.data?.() || {};
  const rawStatus = booking.Booking_Status || booking.status || 'Scheduled';
  const normalizedStatus = normalizeQueueStatus(rawStatus);
  return {
    id: `booking-${docSnap.id}`,
    queueEntryId: null,
    bookingId: docSnap.id,
    stationId: booking.stationId || booking.StationId || booking.station || '',
    carrier: booking.carrier || booking.carrierName || booking.Carrier || booking.CarrierName || booking.carrierId || 'Carrier',
    truck: booking.truck || booking.truckPlate || booking.Truck || '',
    trailer: booking.trailer || booking.trailerId || booking.Trailer || '',
    commodity: booking.commodity || booking.Commodity || '',
    eta: booking.Slot || booking.ArrivalTime || booking.ServiceStartTime || booking.createdAt || '',
    status: normalizedStatus === 'Scheduled' ? 'Waiting' : normalizedStatus
  };
}

function buildHistoryItemFromEntry(entry, booking = {}) {
  return {
    carrier: booking.carrier || booking.carrierName || booking.Carrier || booking.CarrierName || booking.carrierId || 'Carrier',
    truck: booking.truck || booking.truckPlate || booking.Truck || '',
    action: 'completed',
    at: booking.ServiceEndTime || booking.CompletedAt || booking.completedAt || entry.createdAt || ''
  };
}

function buildHistoryFromBookings(bookingsDocs, activeDates = new Set()) {
  const list = [];
  bookingsDocs.forEach(docSnap => {
    const data = docSnap.data() || {};
    const arrivalKey = toDateKey(data.ArrivalTime || data.CompletedAt || data.completedAt || data.createdAt);
    if (activeDates.size && (!arrivalKey || !activeDates.has(arrivalKey))) return;
    list.push({
      carrier: data.carrier || data.carrierName || data.Carrier || data.CarrierName || 'Carrier',
      truck: data.truck || data.truckPlate || data.Truck || '',
      action: 'completed',
      at: data.ArrivalTime || data.CompletedAt || data.completedAt || data.createdAt || ''
    });
  });
  return list;
}

function toDateKey(value) {
  const date = parseAnyDate(value);
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseAnyDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') {
    const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    return new Date(ms);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return null;
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}

function etaToMillis(value) {
  const date = parseAnyDate(value);
  if (date) return date.getTime();
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/(\d+)\s*min/);
    if (match) {
      return Date.now() + Number(match[1]) * 60 * 1000;
    }
    const timeMatch = trimmed.match(/^(\d{1,2})[:.](\d{2})$/);
    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime();
      }
    }
  }
  return Number.POSITIVE_INFINITY;
}

function normalizeQueueStatus(status) {
  if (!status) return 'Waiting';
  const normalized = String(status).trim().toLowerCase();
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'in service' || normalized === 'in-service' || normalized === 'servicing') return 'In Service';
  if (normalized === 'scheduled') return 'Scheduled';
  if (normalized === 'active') return 'Active';
  if (normalized === 'waiting' || normalized === 'queued') return 'Waiting';
  return status;
}

function isCompletedStatus(status) {
  return normalizeQueueStatus(status) === 'Completed';
}

function isActiveQueueStatus(status) {
  return !isCompletedStatus(status);
}

async function completeQueueBooking(entry = {}) {
  const updates = [];
  if (entry.bookingId) {
    updates.push(updateDoc(doc(db, 'Booking', entry.bookingId), {
      Booking_Status: 'Completed',
      ServiceEndTime: new Date()
    }));
  }
  let queueEntryId = entry.queueEntryId || '';
  if (!queueEntryId && entry.bookingId) {
    let stationId = entry.stationId || '';
    if (!stationId) {
      const bookingSnap = await getDoc(doc(db, 'Booking', entry.bookingId));
      if (bookingSnap.exists()) {
        const data = bookingSnap.data() || {};
        stationId = data.stationId || data.StationId || data.station || '';
      }
    }
    if (stationId) {
      const ref = await addDoc(collection(db, 'QueueEntry'), {
        bookingId: entry.bookingId,
        stationId,
        status: 'Completed',
        createdAt: new Date()
      });
      queueEntryId = ref.id;
      entry.queueEntryId = queueEntryId;
    }
  }
  if (queueEntryId) {
    updates.push(updateDoc(doc(db, 'QueueEntry', queueEntryId), { status: 'Completed' }));
  }
  if (!updates.length) {
    throw new Error('Missing bookingId and queue entry id.');
  }
  await Promise.all(updates);
}

async function arriveQueueBooking(entry = {}, targetStatus = 'Waiting') {
  const updates = [];
  if (entry.bookingId) {
    updates.push(updateDoc(doc(db, 'Booking', entry.bookingId), {
      Booking_Status: targetStatus
    }));
  }
  let queueEntryId = entry.queueEntryId || '';
  if (!queueEntryId && entry.bookingId) {
    let stationId = entry.stationId || '';
    if (!stationId) {
      const bookingSnap = await getDoc(doc(db, 'Booking', entry.bookingId));
      if (bookingSnap.exists()) {
        const data = bookingSnap.data() || {};
        stationId = data.stationId || data.StationId || data.station || '';
      }
    }
    if (stationId) {
      const ref = await addDoc(collection(db, 'QueueEntry'), {
        bookingId: entry.bookingId,
        stationId,
        status: targetStatus,
        createdAt: new Date()
      });
      queueEntryId = ref.id;
      entry.queueEntryId = queueEntryId;
    }
  }
  if (queueEntryId) {
    updates.push(updateDoc(doc(db, 'QueueEntry', queueEntryId), { status: targetStatus }));
  }
  if (!updates.length) {
    throw new Error('Missing bookingId and queue entry id.');
  }
  await Promise.all(updates);
}

async function fetchScheduledBookingsForStation(stationId) {
  const bookings = await fetchBookingsByStation(stationId);
  return bookings.filter(docSnap => {
    if (!docSnap.exists()) return false;
    const data = docSnap.data() || {};
    return normalizeQueueStatus(data.Booking_Status || data.status || '') === 'Scheduled';
  });
}

async function fetchBookingsByStation(stationId) {
  const byStationId = await getDocs(
    query(collection(db, 'Booking'), where('stationId', '==', stationId))
  );
  if (!byStationId.empty) return byStationId.docs;
  const byStationIdAlt = await getDocs(
    query(collection(db, 'Booking'), where('StationId', '==', stationId))
  );
  if (!byStationIdAlt.empty) return byStationIdAlt.docs;
  const byStationCode = await getDocs(
    query(collection(db, 'Booking'), where('station', '==', stationId))
  );
  return byStationCode.docs;
}
