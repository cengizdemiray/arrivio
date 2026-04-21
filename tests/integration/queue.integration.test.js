const PROJECT_ID = "arrivio-271aa";
const REGION = "europe-west3";
const BASE_URL = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}`;

async function post(functionName, body) {
  const res = await fetch(`${BASE_URL}/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  return { status: res.status, data };
}

async function createQueueEntry({
  carrierId,
  stationId = "ST-1",
  slotStart = "2026-04-21T10:00:00Z",
  slotEnd = "2026-04-21T10:15:00Z",
}) {
  const enter = await post("enterQueue", { carrierId, stationId, slotStart, slotEnd });
  expect(enter.status).toBe(200);
  expect(enter.data.queueEntryId).toBeDefined();
  return enter.data.queueEntryId;
}

function toIso(minutesFromBase) {
  const base = Date.parse("2026-04-21T14:00:00Z");
  return new Date(base + minutesFromBase * 60_000).toISOString();
}

describe("Integration - Queue Flow", () => {
  jest.setTimeout(30000);

  test("TC-IT-01 Carrier -> Backend -> Operator | queue entry is created and listed with correct order", async () => {
    const stationId = "ST-TC1";
    const q1 = await createQueueEntry({
      carrierId: "C-100",
      stationId,
      slotStart: "2026-04-21T10:00:00Z",
      slotEnd: "2026-04-21T10:15:00Z",
    });
    const q2 = await createQueueEntry({
      carrierId: "C-101",
      stationId,
      slotStart: "2026-04-21T10:15:00Z",
      slotEnd: "2026-04-21T10:30:00Z",
    });

    const queue = await post("getStationQueue", { stationId, limit: 50 });
    expect(queue.status).toBe(200);
    expect(Array.isArray(queue.data.queue)).toBe(true);
    expect(queue.data.stationId).toBe(stationId);

    const e1 = queue.data.queue.find((x) => x.id === q1);
    const e2 = queue.data.queue.find((x) => x.id === q2);
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    expect(e1.queueStatus).toBe("Queued");
    expect(e2.queueStatus).toBe("Queued");
    expect(typeof e1.slotKey).toBe("string");
    expect(e1.slotKey.length).toBeGreaterThan(0);

    const i1 = queue.data.queue.findIndex((x) => x.id === q1);
    const i2 = queue.data.queue.findIndex((x) => x.id === q2);
    expect(i1).toBeLessThan(i2);
  });

  test("TC-IT-02 Operator -> Backend -> Carrier | start and complete service updates active queue", async () => {
    const stationId = "ST-TC2";
    const startCandidate = await createQueueEntry({
      carrierId: "C-200",
      stationId,
      slotStart: "2026-04-21T11:00:00Z",
      slotEnd: "2026-04-21T11:15:00Z",
    });

    const start = await post("startService", { queueEntryId: startCandidate, operatorId: "OP-1" });
    expect(start.status).toBe(200);

    const complete = await post("completeService", { queueEntryId: startCandidate, operatorId: "OP-1" });
    expect(complete.status).toBe(200);

    const queue = await post("getStationQueue", { stationId, limit: 50 });
    expect(queue.status).toBe(200);
    expect(queue.data.queue.some((x) => x.id === startCandidate)).toBe(false);
  });

  test("TC-IT-03 Operator -> Backend -> Carrier | no-show removes queued entry from active list", async () => {
    const stationId = "ST-TC3";
    const noShowCandidate = await createQueueEntry({
      carrierId: "C-300",
      stationId,
      slotStart: "2026-04-21T12:00:00Z",
      slotEnd: "2026-04-21T12:15:00Z",
    });

    const noShow = await post("cancelQueueEntry", {
      queueEntryId: noShowCandidate,
      operatorId: "OP-2",
      reason: "NoShow",
    });
    expect(noShow.status).toBe(200);

    const queue = await post("getStationQueue", { stationId, limit: 50 });
    expect(queue.status).toBe(200);
    expect(queue.data.queue.some((x) => x.id === noShowCandidate)).toBe(false);
  });

  test("TC-IT-04 Invalid state transitions are prevented", async () => {
    const stationId = "ST-TC4";
    const inProgressCandidate = await createQueueEntry({
      carrierId: "C-400",
      stationId,
      slotStart: "2026-04-21T13:00:00Z",
      slotEnd: "2026-04-21T13:15:00Z",
    });
    const blockedStartCandidate = await createQueueEntry({
      carrierId: "C-401",
      stationId,
      slotStart: "2026-04-21T13:15:00Z",
      slotEnd: "2026-04-21T13:30:00Z",
    });
    const invalidCompleteCandidate = await createQueueEntry({
      carrierId: "C-402",
      stationId: "ST-TC5",
      slotStart: "2026-04-21T13:00:00Z",
      slotEnd: "2026-04-21T13:15:00Z",
    });

    const start = await post("startService", { queueEntryId: inProgressCandidate, operatorId: "OP-3" });
    expect(start.status).toBe(200);

    const doubleStart = await post("startService", { queueEntryId: blockedStartCandidate, operatorId: "OP-3" });
    expect(doubleStart.status).toBe(409);
    expect(doubleStart.data.code).toBe("ALREADY_IN_PROGRESS");

    const invalidComplete = await post("completeService", {
      queueEntryId: invalidCompleteCandidate,
      operatorId: "OP-3",
    });
    expect(invalidComplete.status).toBe(409);
    expect(invalidComplete.data.code).toBe("NOT_IN_PROGRESS");
  });

  test("TC-IT-05 Carrier -> Backend -> Operator | multiple carriers are queued and listed in order", async () => {
    const stationId = "ST-TC6";
    const carrierCount = 12;
    const queueEntryIds = [];

    for (let i = 0; i < carrierCount; i += 1) {
      const slotStart = toIso(i * 15);
      const slotEnd = toIso((i + 1) * 15);
      const queueEntryId = await createQueueEntry({
        carrierId: `C-5${String(i).padStart(2, "0")}`,
        stationId,
        slotStart,
        slotEnd,
      });
      queueEntryIds.push(queueEntryId);
    }

    const queue = await post("getStationQueue", { stationId, limit: 200 });
    expect(queue.status).toBe(200);
    expect(Array.isArray(queue.data.queue)).toBe(true);
    expect(queue.data.queue.length).toBeGreaterThanOrEqual(carrierCount);

    for (const id of queueEntryIds) {
      const entry = queue.data.queue.find((x) => x.id === id);
      expect(entry).toBeDefined();
      expect(entry.queueStatus).toBe("Queued");
    }

    for (let i = 1; i < queueEntryIds.length; i += 1) {
      const prev = queue.data.queue.findIndex((x) => x.id === queueEntryIds[i - 1]);
      const next = queue.data.queue.findIndex((x) => x.id === queueEntryIds[i]);
      expect(prev).toBeLessThan(next);
    }
  });
});
