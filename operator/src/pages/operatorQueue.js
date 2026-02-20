// js/pages/operatorQueueManager.js
export async function renderQueueManagerView(root, deps) {
  const {
    loadQueueStations,
    loadStationQueue,
    arriveQueueBooking,
    completeQueueBooking,
    formatNow,
    getCachedStations = () => [],
    setCachedStations = () => {},
    getFocusedStation = () => null,
    onStationFocusChange = () => {}
  } = deps || {};

  // Top-level state per render keeps the view independent from other modules
  root.innerHTML = `<div class="card" style="padding:20px;">Loading queues...</div>`;
  const stations = await loadQueueStations?.() || [];
  let cachedStations = stations;
  const initialFocus = getFocusedStation?.();
  const focusedId = initialFocus?.id || initialFocus?.code || null;
  const hasFocused = focusedId && cachedStations.some(st => (st.id || st.code) === focusedId);
  let selectedStation = hasFocused ? focusedId : (cachedStations[0] ? cachedStations[0].id : null);

  root.innerHTML = `
    <div class="operator-hero">
      <div class="hero-row">
        <div>
          <div class="hero-title">Queue Manager</div>
          <p class="hero-sub">View per-station queues, add carriers, mark no-show or complete.</p>
        </div>
      </div>
    </div>

    <div class="queue-layout">
      <aside class="queue-stations">
        <div class="search-row"><input id="stationFilter" placeholder="Station, code" /></div>
        <ul id="stationList" class="station-list"></ul>
      </aside>
      <div class="queue-detail" id="queueDetail"></div>
    </div>
  `;

  const stationList = root.querySelector('#stationList');
  const stationFilter = root.querySelector('#stationFilter');
  const detail = root.querySelector('#queueDetail');

  function formatTimestamp(value) {
    if (!value) return '';
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value.toDate === 'function') {
      return formatTime(value.toDate());
    }
    if (typeof value.seconds === 'number') {
      const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
      return formatTime(new Date(ms));
    }
    return '';
  }

  function formatTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function formatAvgService(value) {
    if (Number.isFinite(value)) return `${value.toFixed(1)} min`;
    if (typeof value === 'string' && value.trim()) return value;
    return '--';
  }

  // Keep source of truth in module-local var and inform parent cache
  function persistStations(nextStations) {
    cachedStations = nextStations;
    setCachedStations(nextStations);
  }

  function renderStations() {
    // Left column list with simple text filter on name/code
    const term = stationFilter.value.trim().toLowerCase();
    stationList.innerHTML = '';
    cachedStations
      .filter(st => !term || st.name.toLowerCase().includes(term) || st.code.toLowerCase().includes(term))
      .forEach(st => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="station-card ${selectedStation === st.id ? 'active' : ''}" data-id="${st.id}">
            <div class="title">${st.name}</div>
            <div class="meta">
              <span>${st.code}</span>
              <span class="badge ${st.status === 'Operational' ? 'badge-green' : 'badge-amber'}">${st.status}</span>
            </div>
            <div class="meta">
              <span>Queue: ${st.queue.length}</span>
            </div>
          </div>
        `;
        li.addEventListener('click', () => {
          selectedStation = st.id || st.code;
          onStationFocusChange?.({
            id: st.id || st.code,
            code: st.code || st.id || '',
            name: st.name || st.code || 'Station'
          });
          renderStations();
          renderDetail();
          hydrateStationQueue(st.id || st.code).then(() => {
            renderStations();
            renderDetail();
          });
        });
        stationList.appendChild(li);
      });
  }

  async function hydrateStationQueue(stationId) {
    if (!loadStationQueue || !stationId) return;
    const payload = await loadStationQueue(stationId);
    if (!payload) return;
    const queue = Array.isArray(payload) ? payload : (payload.queue || []);
    const history = Array.isArray(payload?.history) ? payload.history : null;
    const next = cachedStations.map(s => {
      if (s.id !== stationId) return s;
      return {
        ...s,
        queue: Array.isArray(queue) ? queue : [],
        history: history ? history : (s.history || []),
        inServiceCount: Number.isFinite(payload.inServiceCount) ? payload.inServiceCount : (s.inServiceCount || 0)
      };
    });
    persistStations(next);
  }

  function persistStation(station) {
    station.lastCall = formatNow();
    const next = cachedStations.map(s => s.id === station.id ? station : s);
    persistStations(next);
  }

  function renderDetail() {
    if (!selectedStation) {
      detail.innerHTML = `<p>Select a station.</p>`;
      return;
    }
    // Find selected station each time to re-render latest queue state
    const st = cachedStations.find(s => s.id === selectedStation);
    if (!st) return;

    const avgWait = `${Math.max(3, st.queue.length * 4)} min`;
    const inServiceCount = Number.isFinite(st.inServiceCount)
      ? st.inServiceCount
      : (st.queue || []).filter(item => String(item.status || '').toLowerCase() === 'in service').length;
    const allQueueItems = Array.isArray(st.queue) ? st.queue : [];

    detail.innerHTML = `
      <div class="queue-head">
        <h3>${st.name}</h3>
        <span class="status-pill ${st.status === 'Operational' ? 'operational' : 'paused'}">${st.status}</span>
      </div>
      <div class="queue-metrics">
        <div class="metric"><div class="label">Queue size</div><div class="value">${st.queue.length}</div></div>
        <div class="metric"><div class="label">Avg wait</div><div class="value">${avgWait}</div></div>
        <div class="metric"><div class="label">Avg service time</div><div class="value">${formatAvgService(st.avgServiceTimeMin)}</div></div>
        <div class="metric"><div class="label">In service now</div><div class="value">${inServiceCount}</div></div>
      </div>
      <div class="add-carrier">
        <input id="carrierName" placeholder="Carrier name" />
        <input id="carrierTruck" placeholder="Truck plate" />
        <input id="carrierTrailer" placeholder="Trailer ID" />
        <input id="carrierCommodity" placeholder="Commodity" />
        <input id="carrierEta" placeholder="ETA (min)" />
      </div>
      <div class="add-actions">
        <button id="addCarrierBtn" class="btn btn-primary">Add to queue</button>
        <span class="meta">Use for manual entries or walk-ins.</span>
      </div>

      <table class="queue-table">
        <thead><tr><th>#</th><th>Carrier</th><th>Truck</th><th>Commodity</th><th>ETA</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${allQueueItems.map((q, idx) => `
            <tr data-id="${q.id}">
              <td>${idx + 1}</td>
              <td>${q.carrier}</td>
              <td>${q.truck}</td>
              <td>${q.commodity || ''}</td>
              <td>${formatTimestamp(q.eta)}</td>
              <td>${q.status || ''}</td>
              <td>
                <div class="queue-actions">
                  <button class="action-btn danger" data-action="no-show" data-id="${q.id}">No-show</button>
                  <button class="action-btn primary" data-action="complete" data-id="${q.id}">Complete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top:12px;">
        <div class="pill">Last call: ${formatTimestamp(st.lastCall) || '--'}</div>
      </div>

      <div style="margin-top:12px;">
        <h4>Recent actions</h4>
        <div id="queueHistory" class="history-list">
          ${(st.history || []).slice(0, 5).map(h => `
            <div class="history-item">
              <strong>${h.carrier}</strong>
              <div class="meta">${formatTimestamp(h.at) || ''} - ${h.action}</div>
              <div>${h.truck || ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const addBtn = detail.querySelector('#addCarrierBtn');
    addBtn.addEventListener('click', () => {
      // Manual enqueue of a carrier into the selected station queue
      const carrier = detail.querySelector('#carrierName').value.trim();
      const truck = detail.querySelector('#carrierTruck').value.trim();
      const trailer = detail.querySelector('#carrierTrailer').value.trim();
      const commodity = detail.querySelector('#carrierCommodity').value.trim();
      const eta = detail.querySelector('#carrierEta').value.trim() || '~8 min';
      if (!carrier || !truck) return;
      st.queue.push({ id: `Q-${Date.now()}`, carrier, truck, trailer, commodity, eta, status: 'waiting' });
      persistStation(st);
      renderStations();
      renderDetail();
    });

    detail.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Action buttons remove from queue and log into history
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const idx = st.queue.findIndex(q => q.id === id);
        if (idx === -1) return;
        const entry = st.queue[idx];
        if (action === 'complete' && completeQueueBooking) {
          btn.disabled = true;
          try {
            await completeQueueBooking(entry);
          } catch (err) {
            console.error('Failed to complete booking', err);
            alert(err?.message || 'Could not complete booking.');
            btn.disabled = false;
            return;
          }
        }
        st.queue.splice(idx, 1);
        st.history = st.history || [];
        st.history.unshift({ carrier: entry.carrier, action, at: formatNow(), truck: entry.truck });
        persistStation(st);
        renderStations();
        renderDetail();
      });
    });
  }

  stationFilter.addEventListener('input', renderStations);

  renderStations();
  renderDetail();
  if (selectedStation) {
    const selected = cachedStations.find(st => st.id === selectedStation || st.code === selectedStation);
    if (selected) {
      onStationFocusChange?.({
        id: selected.id || selected.code,
        code: selected.code || selected.id || '',
        name: selected.name || selected.code || 'Station'
      });
    }
  }
  if (selectedStation) {
    hydrateStationQueue(selectedStation).then(() => {
      renderStations();
      renderDetail();
    });
  }
}
