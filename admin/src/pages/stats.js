const GET_ACTIVE_STATIONS_URL = "https://getactivestations-7xyjjmcxha-ey.a.run.app";

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Number(value).toFixed(digits);
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return "active";
  if (value === "inactive") return "inactive";
  return "unknown";
}

async function getStationsFromBackend() {
  const response = await fetch(GET_ACTIVE_STATIONS_URL, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.stations || [];
}

function renderStatsHTML(stations) {
  return `
    <div class="stats-v2-root">
      <div class="stats-v2-head">
        <div>
          <h2>Station Capacity Metrics</h2>
          <p>Service efficiency and slot planning indicators for active facilities.</p>
        </div>
        <span class="stats-v2-count">${stations.length} stations</span>
      </div>

      <div class="stats-v2-grid">
        ${stations.map((station) => `
          <article class="stats-v2-card">
            <div class="stats-v2-card-head">
              <div>
                <h3>${station.name || "Unnamed Station"}</h3>
                <p class="station-code">${station.code || "-"}</p>
              </div>
              <span class="station-status is-${normalizeStatus(station.status)}">${station.status || "Unknown"}</span>
            </div>

            <div class="stats-v2-meta">
              <span><strong>Type</strong> ${station.type || "-"}</span>
              <span><strong>Contact</strong> ${station.contactName || "-"}</span>
              <span><strong>Phone</strong> ${station.phone || "-"}</span>
            </div>

            <div class="stats-v2-kpis">
              <div class="kpi-tile">
                <span class="kpi-label">Avg Service Time</span>
                <span class="kpi-value">${formatNumber(station.avgServiceTimeMin, 2)} min</span>
              </div>
              <div class="kpi-tile">
                <span class="kpi-label">Completed Jobs</span>
                <span class="kpi-value">${station.completedJobsCount ?? 0}</span>
              </div>
              <div class="kpi-tile">
                <span class="kpi-label">Total Service Time</span>
                <span class="kpi-value">${formatNumber(station.totalServiceTimeMin, 2)} min</span>
              </div>
            </div>

            <dl class="stats-v2-list">
              <div><dt>Mu / min</dt><dd>${formatNumber(station.muPerMin, 4)}</dd></div>
              <div><dt>Lambda Target / min</dt><dd>${formatNumber(station.lambdaTargetPerMin, 4)}</dd></div>
              <div><dt>Target Utilization</dt><dd>${formatNumber(station.targetUtilization, 2)}</dd></div>
              <div><dt>Slot Duration</dt><dd>${station.slotTimeInterval ?? "-"} min</dd></div>
              <div><dt>Optimal Trucks / Slot</dt><dd>${station.optimalTruckPerSlot ?? "-"}</dd></div>
              <div><dt>Confidence</dt><dd>${station.confidence || "-"}</dd></div>
            </dl>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="stats-v2-state">
      <p>Loading station statistics...</p>
    </div>
  `;
}

function renderEmpty() {
  return `
    <div class="stats-v2-state">
      <p>No active stations found.</p>
    </div>
  `;
}

function renderError() {
  return `
    <div class="stats-v2-state is-error">
      <p>Failed to load station statistics.</p>
    </div>
  `;
}

export async function initStats(root) {
  if (!root) return;

  root.innerHTML = renderLoading();

  try {
    const stations = await getStationsFromBackend();

    if (!stations.length) {
      root.innerHTML = renderEmpty();
      return;
    }

    root.innerHTML = renderStatsHTML(stations);
  } catch (error) {
    console.error("initStats error:", error);
    root.innerHTML = renderError();
  }
}


