

export function renderQueueManagerView(viewRoot, options = {}) {
  const endpoints = {
    getActiveStations: "https://getactivestations-7xyjjmcxha-ey.a.run.app",
    getStationQueue: "https://getstationqueue-7xyjjmcxha-ey.a.run.app",
    startService: "https://startservice-7xyjjmcxha-ey.a.run.app",
    completeService: "https://completeservice-7xyjjmcxha-ey.a.run.app",
    cancelQueueEntry: "https://cancelqueueentry-7xyjjmcxha-ey.a.run.app",
    //updateStationAverageServiceTime: "https://updatestationaverageservicetime-7xyjjmcxha-ey.a.run.app",
  };
  const refreshMs = Number(options.refreshMs) || 30000;
  viewRoot.innerHTML = `
    <div class="oq-wrap">
      <div class="oq-hero">
        <div>
          <h2>Queue Manager</h2>
          <p>Start / Complete / No-show — HTTP Functions ile bağlı.</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button id="oqRefresh" class="btn ghost" type="button">Refresh</button>
        </div>
      </div>

      <div class="oq-layout">
        <aside class="oq-card oq-side">
          <div class="oq-search">
            <input id="oqFilter" placeholder="Search station name / code" />
          </div>
          <ul id="oqStations" class="oq-list"></ul>
        </aside>

        <main class="oq-card">
          <div id="oqDetail">Select a station…</div>
        </main>
      </div>
    </div>
  `;

  // viewRoot içinde selector aramak için
  const $ = (sel) => viewRoot.querySelector(sel);
  // ortak POST helper
  const post = async (functionName, body) => {
    const url = endpoints[functionName];
    if (!url) throw new Error(`Endpoint not found: ${functionName}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed with status ${res.status}`);
    return data;
  };
  // sağ altta kısa süreli bildirimler için
  const toast = (title, msg) => {
    const el = document.createElement("div");
    el.className = "oq-toast";
    el.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(
      msg || ""
    )}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  };

  const asDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") {
      const ms = v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  const hhmm = (v) => {
    const d = asDate(v);
    if (!d) return "--:--";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const escapeHtml = (str) =>
    String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  let stations = [];
  let selectedStationId = null;
  let busy = false; // bir işlem sırasında tekrar tıklamayı önlemek
  let timer = null;
  let lastRefresh = null;

  //station listesini çeken fonksiyon
  async function fetchStations() {
    const data = await post("getActiveStations", {});
    const array = Array.isArray(data) ? data : data.stations || [];
    stations = array.map((s) => ({
      id: s.id || s.code || "",
      code: s.code || "",
      queueKey: s.id || s.code || "",
      name: s.name || s.stationName || s.Name || s.code || "Station",
      status: s.status || "active",
      avgServiceTimeMin: Number(s.avgServiceTimeMin ?? s.averageServiceTimeMin ?? NaN),
    }));
    //ilk açılışta otomatik olarak ilk station seçili gelsin
    if (!selectedStationId && stations[0]) selectedStationId = stations[0].id;
  }

  async function fetchQueue(stationId) {
    const data = await post("getStationQueue", { stationId });
    const array = Array.isArray(data) ? data : data.queue || [];
    const queue = (data.queue || []).map((q) => ({
      id: q.id,
      carrierId: q.carrierId,
      slotKey: q.slotKey || "",
      queueStatus: q.queueStatus,
      createdAt: q.createdAt,
      startedAt: q.startedAt,
      completedAt: q.completedAt,
    }));

    const idx = stations.findIndex((s) => s.id === stationId);
    if (idx != -1) {
      stations[idx] = {
        ...stations[idx],
        queue,
        inServiceCount: queue.filter((q) => q.queueStatus === "InProgress").length,
      };
    }
  }

  async function startService(queueEntryId) {
    await post("startService", { queueEntryId });
    toast("Service started", `Queue Entry ID: ${queueEntryId}`);
  }

  async function completeService(queueEntryId) {
    await post("completeService", { queueEntryId });
  }

  async function cancelQueueEntry(queueEntryId) {
    await post("cancelQueueEntry", { queueEntryId, reason: "No-show" });
  }

  // UI Renderer Fonksiyonları
  function renderStationList() {
    const term = ($("#oqFilter").value || "").trim().toLowerCase();
    const ul = $("#oqStations");
    ul.innerHTML = "";
    stations
      .filter(
        (s) =>
          !term ||
          s.name.toLowerCase().includes(term)
      )
      .forEach((s) => {
        const queuedCount = Array.isArray(s.queue)
          ? s.queue.filter((q) => q.queueStatus === "Queued").length
          : 0;
        const inServiceCount = Number(s.inServiceCount || 0);
        const li = document.createElement("li");

        li.innerHTML = `
          <div class="oq-st ${s.id === selectedStationId ? "active" : ""}" data-id="${s.id}">
            <div class="top">
              <div class="name">${escapeHtml(s.name)}</div>
              <span class="badge ${String(s.status).toLowerCase() === "active" ? "ok" : "amb"
          }">${escapeHtml(String(s.status))}</span>
            </div>
            <div class="meta">
              <span>${escapeHtml(s.code)}</span>
              <span>Queued: <strong>${queuedCount}</strong></span>
              <span>In service: <strong>${inServiceCount}</strong></span>
            </div>
          </div>
        `;

        // Station'a tıklanınca sağ panel yenilensin
        li.addEventListener("click", async () => {
          selectedStationId = s.id;

          // Solda aktif highlight için tekrar render
          renderStationList();

          // Seçilen station queue'sunu çekip detay paneli güncelle
          await refreshSelected();
        });

        ul.appendChild(li);
      });
  }

  function renderDetail() {
    const host = $("#oqDetail");
    const st = stations.find((s) => s.id === selectedStationId);
    if (!st) {
      host.innerHTML = "Select a station...";
      return;
    }
    const q = Array.isArray(st.queue) ? st.queue : [];
    const inProg = q.find((e) => e.queueStatus === "InProgress") || null;
    const queued = q.filter((e) => e.queueStatus === "Queued") || [];
    const avgService = Number.isFinite(st.avgServiceTimeMin)
      ? `${st.avgServiceTimeMin.toFixed(1)} min`
      : "--";
    host.innerHTML = `
      <div class="oq-head">
        <h3>${escapeHtml(st.name)}</h3>
        <span class="badge ${String(st.status).toLowerCase() === "active" ? "ok" : "amb"
      }">${escapeHtml(String(st.status))}</span>
      </div>

      <div class="oq-metrics">
        <div class="metric"><div class="label">Queued</div><div class="value">${queued.length}</div></div>
        <div class="metric"><div class="label">In progress</div><div class="value">${inProg ? 1 : 0}</div></div>
        <div class="metric"><div class="label">Avg service</div><div class="value">${avgService}</div></div>
      </div>

      <div class="oq-inprog">
        <div>
          <div class="small">IN PROGRESS</div>
          <div class="who">${inProg ? escapeHtml(inProg.carrierId || inProg.id) : "—"}</div>
          <div class="small" style="margin-top:6px;">
            Started: ${inProg ? hhmm(inProg.startedAt) : "--:--"} · Slot: ${inProg ? escapeHtml(inProg.slotKey) : ""}
          </div>
        </div>
        <button class="btn primary" id="btnTopComplete" ${inProg ? "" : "disabled"
      }>Complete</button>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>#</th><th>Carrier</th><th>Slot</th><th>Created</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${q
        .map((item, i) => {
          // FIFO yok: queued olan herhangi biri start edilebilir
          // MM1 var: inProg varken start edilmesin (backend zaten reddedebilir)
          const canStart = item.queueStatus === "Queued" && !inProg;

          // No-show sadece Queued için
          const canNoShow = item.queueStatus === "Queued";

          // Complete sadece InProgress için
          const canComplete = item.queueStatus === "InProgress";

          return `
                <tr>
                  <td>${i + 1}</td>
                  <td>${escapeHtml(item.carrierId || item.id)}</td>
                  <td>${escapeHtml(item.slotKey || "")}</td>
                  <td>${hhmm(item.createdAt)}</td>
                  <td>${escapeHtml(item.queueStatus)}</td>
                  <td>
                    <div class="actions">
                      <button class="btn primary" data-action="start" data-id="${item.id}" ${canStart ? "" : "disabled"
            }>Start</button>
                      <button class="btn danger" data-action="no-show" data-id="${item.id}" ${canNoShow ? "" : "disabled"
            }>No-show</button>
                      <button class="btn primary" data-action="complete" data-id="${item.id}" ${canComplete ? "" : "disabled"
            }>Complete</button>
                    </div>
                  </td>
                </tr>
              `;
        })
        .join("")}
        </tbody>
      </table>

      <div class="oq-foot">
        <div>Last refresh: ${lastRefresh ? hhmm(lastRefresh) : "--:--"}</div>
        <div>${busy ? "Working…" : ""}</div>
      </div>
    `;
    // Detay panelindeki butonlara tıklanınca ilgili action'ı çağır
    $("#btnTopComplete")?.addEventListener("click", async () => {
      if (!inProg) return;
      await handleAction("complete", inProg.id);
    });

    // Tablo satır butonları
    host.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await handleAction(btn.dataset.action, btn.dataset.id);
      });
    });
  }
  //Aksiyonları yöneten fonksiyon
  async function handleAction(action, id) {
    if (!id || busy) return;

    busy = true;
    renderDetail();
    try {
      if (action === "start") {
        await startService(id);
        toast("Started", "Service started successfully");
      } else if (action === "complete") {
        await completeService(id);
        toast("Completed", "Service completed successfully");
      } else if (action === "no-show") {
        await cancelQueueEntry(id);
        toast("No-show", "Queue entry marked as no-show");
      }
      await refreshSelected();
    } catch (err) {
      console.error(err);
      toast("Error", err.message || "Action failed");
    } finally {
      busy = false;
      renderDetail();
    }
  }
  async function refreshSelected() {
    if (!selectedStationId) return;
    const st = stations.find((s) => s.id === selectedStationId);
    const stationKey = st?.queueKey || st?.id || st?.code || selectedStationId;
    await fetchQueue(stationKey);
    lastRefresh = new Date();
    renderStationList();
    renderDetail();
  }

  function startAutoRefresh() {
    if (timer) clearInterval(timer);

    // 0 / falsy verilirse auto refresh kapalı
    if (!refreshMs || refreshMs <= 0) return;

    timer = setInterval(() => {
      if (!selectedStationId || busy) return;
      refreshSelected().catch(() => { });
    }, refreshMs);
  }

  (async () => {
    await fetchStations();
    renderStationList();
    await refreshSelected();
    //startAutoRefresh();
    $("#oqFilter").addEventListener("input", renderStationList);
    $("#oqRefresh").addEventListener("click", () => refreshSelected());
  })().catch((err) => {
    console.error(err);
    viewRoot.innerHTML = `<div class="oq-card">Failed to load Queue Manager: ${escapeHtml(
      err?.message || String(err)
    )}</div>`;
  });

  return () => {
    if(timer) clearInterval(timer);
  };
}
