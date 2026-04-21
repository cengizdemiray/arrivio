import {
  validateIssueInput,
  buildIssueDocument,
} from "../../operator/src/services/operatorServices.js";
import {
  normalizeIssue,
  searchIssues,
  buildIssueResolvePayload,
} from "../../admin/src/services/adminServices.js";

const PROJECT_ID = "arrivio-271aa";
const FIRESTORE_BASE =
  `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const createdIssueIds = new Set();

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value) } };
  }
  return { stringValue: String(value) };
}

function encodeFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = encodeValue(v);
  return out;
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(decodeValue);
  }
  if ("mapValue" in value) {
    return decodeFields(value.mapValue.fields || {});
  }
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function issueDocUrl(issueId) {
  return `${FIRESTORE_BASE}/issues/${issueId}`;
}

async function putIssue(issueId, data) {
  const res = await fetch(issueDocUrl(issueId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`putIssue failed (${res.status}): ${body}`);
  }
  createdIssueIds.add(issueId);
}

async function patchIssue(issueId, data) {
  const params = new URLSearchParams();
  for (const k of Object.keys(data)) params.append("updateMask.fieldPaths", k);
  const res = await fetch(`${issueDocUrl(issueId)}?${params.toString()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`patchIssue failed (${res.status}): ${body}`);
  }
}

async function getIssue(issueId) {
  const res = await fetch(issueDocUrl(issueId));
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`getIssue failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return {
    id: issueId,
    ...decodeFields(json.fields || {}),
  };
}

async function listIssues() {
  const res = await fetch(`${FIRESTORE_BASE}/issues?pageSize=200`);
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`listIssues failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  const docs = json.documents || [];
  return docs.map((d) => {
    const id = String(d.name || "").split("/").pop();
    return { id, ...decodeFields(d.fields || {}) };
  });
}

async function deleteIssue(issueId) {
  await fetch(issueDocUrl(issueId), { method: "DELETE" });
}

function uniqueIssueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

describe("Integration - Issue Reporting Flow", () => {
  jest.setTimeout(30000);

  afterEach(async () => {
    const ids = Array.from(createdIssueIds);
    createdIssueIds.clear();
    await Promise.all(ids.map((id) => deleteIssue(id)));
  });

  test("TC-IR-01 Operator -> Backend(Admin) | valid issue is stored with user, station and timestamps", async () => {
    const timestamp = "2026-04-21T15:00:00Z";
    const validation = validateIssueInput("Scanner failure", "ST-IR1");
    expect(validation.valid).toBe(true);

    const issueDoc = buildIssueDocument({
      title: "Scanner failure",
      station: "ST-IR1",
      priority: "High",
      reporter: "Operator Desk",
      description: "Could not scan vehicle plate.",
      timestamp,
    });

    const issueId = uniqueIssueId("ir1");
    await putIssue(issueId, {
      ...issueDoc,
      CreatedAt: timestamp,
      createdAt: timestamp,
      CreatedByUid: "op-100",
      CreatedByRole: "operator",
    });

    const stored = await getIssue(issueId);
    const normalized = normalizeIssue(stored);

    expect(normalized.Title).toBe("Scanner failure");
    expect(normalized.Facility).toBe("ST-IR1");
    expect(normalized.Priority).toBe("High");
    expect(normalized.Status).toBe("Waiting");
    expect(normalized.CreatedByUid).toBe("op-100");
    expect(stored.CreatedAt).toBe(timestamp);
    expect(stored.CreatedByRole).toBe("operator");
  });

  test("TC-IR-02 Backend(Admin) -> Admin Panel | issue is visible and searchable in admin list", async () => {
    const issueId = uniqueIssueId("ir2");
    await putIssue(issueId, {
      Title: "Fuel leak warning",
      Description: "Leak sensor alarm triggered",
      Facility: "ST-IR2",
      Priority: "Medium",
      Status: "Waiting",
      CreatedAt: "2026-04-21T16:00:00Z",
    });

    const allIssues = await listIssues();
    const normalized = allIssues.map((x) => normalizeIssue(x));
    const waiting = normalized.filter((x) => x.Status === "Waiting");
    const byTitle = searchIssues(waiting, "fuel");
    const byStation = searchIssues(waiting, "ST-IR2");

    expect(waiting.some((x) => x.id === issueId)).toBe(true);
    expect(byTitle.some((x) => x.id === issueId)).toBe(true);
    expect(byStation.some((x) => x.id === issueId)).toBe(true);
  });

  test("TC-IR-03 Admin -> Backend -> Operator | mark solved updates status and timestamp", async () => {
    const issueId = uniqueIssueId("ir3");
    await putIssue(issueId, {
      Title: "Queue display frozen",
      Description: "Operator queue screen not refreshing",
      Facility: "ST-IR3",
      Priority: "High",
      Status: "Waiting",
      CreatedAt: "2026-04-21T17:00:00Z",
    });

    const payload = buildIssueResolvePayload();
    await patchIssue(issueId, {
      ...payload,
      UpdatedAt: "2026-04-21T17:10:00Z",
    });

    const stored = await getIssue(issueId);
    const normalized = normalizeIssue(stored);
    expect(normalized.Status).toBe("Solved");
    expect(stored.UpdatedAt).toBe("2026-04-21T17:10:00Z");
  });

  test("TC-IR-04 Invalid issue submissions return validation errors and do not create records", async () => {
    const before = await listIssues();

    const missingTitle = validateIssueInput("", "ST-IR4");
    expect(missingTitle.valid).toBe(false);
    expect(missingTitle.error).toBe("Title is required.");

    const missingStation = validateIssueInput("Power outage", "");
    expect(missingStation.valid).toBe(false);
    expect(missingStation.error).toBe("Station is required.");

    const after = await listIssues();
    expect(after.length).toBe(before.length);
  });
});
